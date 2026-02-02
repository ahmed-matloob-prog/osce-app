import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import type { Station, ChecklistItem, StationType, ScoringOption } from '../types';
import { SCORING_PRESETS } from '../types';

interface ParsedStation {
  station: Partial<Station>;
  rawText: string;
  warnings: string[];
}

/**
 * Parse scoring pattern like [2] [1] [0] or [3] [1 2] [0]
 */
function parseScoringPattern(text: string): ScoringOption[] {
  // Match patterns like [2], [1 2], [0]
  const bracketPattern = /\[(\d+(?:\s+\d+)?)\]/g;
  const matches = [...text.matchAll(bracketPattern)];

  if (matches.length === 0) {
    // Default to standard 2/1/0
    return SCORING_PRESETS.standard.options.map(o => ({ ...o }));
  }

  const options: ScoringOption[] = [];

  for (const match of matches) {
    const values = match[1].split(/\s+/).map(v => parseInt(v, 10));
    // For patterns like [1 2], use the higher value
    const value = Math.max(...values);

    // Determine label based on position and value
    let label = `Score ${value}`;
    let labelAr = `درجة ${value}`;

    if (value === 0) {
      label = 'Incompetent';
      labelAr = 'غير كفء';
    } else if (matches.length === 2) {
      // Binary scoring
      label = value > 0 ? 'Done' : 'Not done';
      labelAr = value > 0 ? 'تم' : 'لم يتم';
    } else if (matches.length >= 3) {
      // 3+ level scoring
      const sortedMatches = matches.map(m => Math.max(...m[1].split(/\s+/).map(v => parseInt(v, 10)))).sort((a, b) => b - a);
      const position = sortedMatches.indexOf(value);

      if (position === 0) {
        label = 'Competent';
        labelAr = 'كفء';
      } else if (position === sortedMatches.length - 1) {
        label = 'Incompetent';
        labelAr = 'غير كفء';
      } else {
        label = 'Borderline';
        labelAr = 'حدّي';
      }
    }

    options.push({ value, label, labelAr });
  }

  // Sort by value descending
  return options.sort((a, b) => b.value - a.value);
}

/**
 * Extract checklist item from a line
 */
function parseChecklistLine(line: string): ChecklistItem | null {
  // Skip empty lines or header lines
  if (!line.trim() || line.includes('competent') || line.includes('Objective tested')) {
    return null;
  }

  // Check if line has scoring brackets
  const hasBrackets = /\[\d+/.test(line);
  if (!hasBrackets) {
    return null;
  }

  // Extract scoring pattern
  const scoringOptions = parseScoringPattern(line);
  const maxScore = Math.max(...scoringOptions.map(o => o.value));

  // Extract item text (remove scoring brackets and clean up)
  let text = line
    .replace(/\[\d+(?:\s+\d+)?\]/g, '') // Remove scoring brackets
    .replace(/\\_+/g, '') // Remove underscores
    .replace(/\\\(/g, '(') // Fix escaped parentheses
    .replace(/\\\)/g, ')')
    .replace(/\\\./g, '.')
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  if (!text || text.length < 3) {
    return null;
  }

  return {
    id: uuidv4(),
    text,
    category: '',
    scoringOptions,
    maxScore,
    position: 'before_findings',
  };
}

/**
 * Detect station type from content
 */
function detectStationType(text: string): StationType {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('examination') || lowerText.includes('physical exam') || lowerText.includes('examine')) {
    return 'examination';
  }
  if (lowerText.includes('procedure') || lowerText.includes('skill') || lowerText.includes('perform')) {
    return 'procedure';
  }
  if (lowerText.includes('communication') || lowerText.includes('counsel') || lowerText.includes('explain to patient')) {
    return 'communication';
  }
  // Default to history
  return 'history';
}

/**
 * Parse Word document to extract station data
 */
export async function parseWordDocument(file: File): Promise<ParsedStation> {
  const warnings: string[] = [];

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Convert to HTML using mammoth
  const result = await mammoth.convertToHtml({ arrayBuffer });

  if (result.messages.length > 0) {
    warnings.push(...result.messages.map(m => m.message));
  }

  // Also get raw text
  const textResult = await mammoth.extractRawText({ arrayBuffer });
  const rawText = textResult.value;

  // Parse the content
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);

  // Initialize station
  const station: Partial<Station> = {
    id: uuidv4(),
    stationNumber: 1,
    stationType: 'history',
    name: '',
    scenario: '',
    tasks: [],
    timeLimit: 600,
    checklistItems: [],
    examinationFindings: '',
    globalRatingEnabled: true,
  };

  let currentSection: 'header' | 'checklist' | 'findings' | 'ddx' | 'scenario' = 'header';
  const checklistItems: ChecklistItem[] = [];
  const ddxItems: ChecklistItem[] = [];
  let scenarioText = '';
  let findingsText = '';
  let stationTitle = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Detect station title
    if (lowerLine.includes('objective tested') || lowerLine.includes('station')) {
      const match = line.match(/station\s*(\d+)/i);
      if (match) {
        station.stationNumber = parseInt(match[1], 10);
      }
      stationTitle = line.replace(/objective tested/i, '').replace(/station\s*\d+/i, '').replace(/[()]/g, '').trim();
      currentSection = 'checklist';
      continue;
    }

    // Detect examination findings section
    if (lowerLine.includes('examination finding') || lowerLine.includes('by examiner')) {
      currentSection = 'findings';
      continue;
    }

    // Detect DDX section
    if (lowerLine.includes('ddx:') || lowerLine.includes('differential')) {
      currentSection = 'ddx';
      continue;
    }

    // Detect scenario section (usually at bottom with patient description)
    if (/^\d+\s*years?\s*(old)?\s*(male|female)/i.test(line) ||
        /^(male|female),?\s*\d+\s*years?/i.test(line)) {
      currentSection = 'scenario';
      scenarioText = line;
      continue;
    }

    // Detect tasks (numbered list)
    if (/^\d+[\.\)]\s*/.test(line) && currentSection === 'scenario') {
      const taskText = line.replace(/^\d+[\.\)]\s*/, '').trim();
      if (taskText && !taskText.toLowerCase().includes('total mark')) {
        station.tasks?.push(taskText);
      }
      continue;
    }

    // Process based on current section
    switch (currentSection) {
      case 'checklist': {
        const item = parseChecklistLine(line);
        if (item) {
          checklistItems.push(item);
        }
        break;
      }

      case 'findings': {
        // Skip scoring lines and section markers
        if (!/\[\d+/.test(line) && !lowerLine.includes('total mark') && !lowerLine.includes('global rating')) {
          if (line.length > 5) {
            findingsText += (findingsText ? '\n' : '') + line;
          }
        }
        break;
      }

      case 'ddx': {
        // DDX items often don't have scoring in this section, but might be listed
        if (line.length > 3 && !lowerLine.includes('total mark') && !lowerLine.includes('global rating')) {
          const ddxItem: ChecklistItem = {
            id: uuidv4(),
            text: line.replace(/[_*]/g, '').trim(),
            category: 'DDX',
            scoringOptions: SCORING_PRESETS.standard.options.map(o => ({ ...o })),
            maxScore: 2,
            position: 'after_findings',
          };
          if (ddxItem.text.length > 3) {
            ddxItems.push(ddxItem);
          }
        }
        break;
      }
    }
  }

  // Clean up findings text
  findingsText = findingsText
    .replace(/examination finding[^:]*:/i, '')
    .replace(/by examiner/i, '')
    .replace(/[_*]/g, '')
    .trim();

  // Set station properties
  station.name = stationTitle || `Station ${station.stationNumber}`;
  station.scenario = scenarioText;
  station.examinationFindings = findingsText;
  station.stationType = detectStationType(rawText);

  // Combine checklist items
  station.checklistItems = [
    ...checklistItems.map(item => ({ ...item, position: 'before_findings' as const })),
    ...ddxItems,
  ];

  // If no tasks found, add default
  if (!station.tasks?.length) {
    station.tasks = [''];
  }

  // Add warnings for missing data
  if (!station.name) warnings.push('Could not extract station name');
  if (!station.scenario) warnings.push('Could not extract scenario');
  if (checklistItems.length === 0) warnings.push('No checklist items found');

  return {
    station,
    rawText,
    warnings,
  };
}

/**
 * Parse multiple Word documents
 */
export async function parseMultipleDocuments(files: FileList): Promise<ParsedStation[]> {
  const results: ParsedStation[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name.endsWith('.docx')) {
      try {
        const parsed = await parseWordDocument(file);
        results.push(parsed);
      } catch (error) {
        results.push({
          station: { name: file.name },
          rawText: '',
          warnings: [`Failed to parse ${file.name}: ${error}`],
        });
      }
    }
  }

  return results;
}
