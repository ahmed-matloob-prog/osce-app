import { v4 as uuidv4 } from 'uuid';
import type { Station, ChecklistItem, StationType, ScoringOption } from '../types';

interface ParsedStation {
  station: Partial<Station>;
  warnings: string[];
}

/**
 * Parse scoring pattern like 2/1/0 or 3/1/0
 */
function parseScoringFromText(scoringText: string): { options: ScoringOption[]; maxScore: number } {
  const values = scoringText.split('/').map(v => parseInt(v.trim(), 10)).filter(v => !isNaN(v));

  if (values.length === 0) {
    // Default to standard 2/1/0
    return {
      options: [
        { value: 2, label: 'Competent', labelAr: 'كفء' },
        { value: 1, label: 'Borderline', labelAr: 'حدّي' },
        { value: 0, label: 'Incompetent', labelAr: 'غير كفء' },
      ],
      maxScore: 2,
    };
  }

  // Sort values descending
  values.sort((a, b) => b - a);
  const maxScore = values[0];

  const options: ScoringOption[] = values.map((value, index) => {
    let label: string;
    let labelAr: string;

    if (values.length === 2) {
      // Binary
      label = value > 0 ? 'Done' : 'Not done';
      labelAr = value > 0 ? 'تم' : 'لم يتم';
    } else {
      // Multi-level
      if (index === 0) {
        label = 'Competent';
        labelAr = 'كفء';
      } else if (index === values.length - 1) {
        label = 'Incompetent';
        labelAr = 'غير كفء';
      } else {
        label = 'Borderline';
        labelAr = 'حدّي';
      }
    }

    return { value, label, labelAr };
  });

  return { options, maxScore };
}

/**
 * Parse a single station block
 */
function parseStationBlock(block: string): ParsedStation {
  const warnings: string[] = [];
  const lines = block.split('\n').map(l => l.trim());

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

  let currentSection = '';
  let checklistItems: ChecklistItem[] = [];
  let ddxItems: ChecklistItem[] = [];

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line || line.startsWith('#') || line.startsWith('=')) continue;

    // Check for section headers
    if (line.startsWith('STATION_NUMBER:')) {
      station.stationNumber = parseInt(line.replace('STATION_NUMBER:', '').trim(), 10) || 1;
      continue;
    }
    if (line.startsWith('STATION_NAME:')) {
      station.name = line.replace('STATION_NAME:', '').trim();
      continue;
    }
    if (line.startsWith('STATION_TYPE:')) {
      const type = line.replace('STATION_TYPE:', '').trim().toLowerCase();
      if (['history', 'examination', 'procedure', 'communication'].includes(type)) {
        station.stationType = type as StationType;
      }
      continue;
    }
    if (line.startsWith('TIME_LIMIT:')) {
      const minutes = parseInt(line.replace('TIME_LIMIT:', '').trim(), 10);
      station.timeLimit = (minutes || 10) * 60;
      continue;
    }

    // Section markers
    if (line === 'SCENARIO:') {
      currentSection = 'scenario';
      continue;
    }
    if (line === 'TASKS:') {
      currentSection = 'tasks';
      continue;
    }
    if (line === 'EXAMINATION_FINDINGS:') {
      currentSection = 'findings';
      continue;
    }
    if (line === 'CHECKLIST:') {
      currentSection = 'checklist';
      continue;
    }
    if (line === 'DDX:') {
      currentSection = 'ddx';
      continue;
    }

    // Process content based on current section
    switch (currentSection) {
      case 'scenario':
        station.scenario = (station.scenario ? station.scenario + ' ' : '') + line;
        break;

      case 'tasks':
        // Parse numbered tasks like "1. Take focused history"
        const taskMatch = line.match(/^\d+[\.\)]\s*(.+)$/);
        if (taskMatch) {
          station.tasks!.push(taskMatch[1].trim());
        } else if (line.length > 2) {
          station.tasks!.push(line);
        }
        break;

      case 'findings':
        station.examinationFindings = (station.examinationFindings ? station.examinationFindings + '\n' : '') + line;
        break;

      case 'checklist':
      case 'ddx': {
        // Parse checklist item: [2/1/0] Item text
        const itemMatch = line.match(/^\[([^\]]+)\]\s*(.+)$/);
        if (itemMatch) {
          const scoringText = itemMatch[1];
          const itemText = itemMatch[2].trim();
          const { options, maxScore } = parseScoringFromText(scoringText);

          const item: ChecklistItem = {
            id: uuidv4(),
            text: itemText,
            category: currentSection === 'ddx' ? 'DDX' : '',
            scoringOptions: options,
            maxScore,
            position: currentSection === 'ddx' ? 'after_findings' : 'before_findings',
          };

          if (currentSection === 'ddx') {
            ddxItems.push(item);
          } else {
            checklistItems.push(item);
          }
        }
        break;
      }
    }
  }

  // Combine checklist items
  station.checklistItems = [...checklistItems, ...ddxItems];

  // Validation warnings
  if (!station.name) warnings.push('Station name not found');
  if (!station.scenario) warnings.push('Scenario not found');
  if (station.checklistItems!.length === 0) warnings.push('No checklist items found');
  if (station.tasks!.length === 0) {
    station.tasks = [''];
    warnings.push('No tasks found');
  }

  return { station, warnings };
}

/**
 * Parse text file containing one or more stations
 */
export function parseTextFile(content: string): ParsedStation[] {
  const results: ParsedStation[] = [];

  // Split by station markers
  const stationBlocks = content.split(/---BEGIN STATION---/i);

  for (const block of stationBlocks) {
    // Skip empty blocks or header content
    if (!block.trim() || !block.includes('STATION_')) continue;

    // Remove end marker if present
    const cleanBlock = block.split(/---END STATION---/i)[0];

    const parsed = parseStationBlock(cleanBlock);
    results.push(parsed);
  }

  // If no station markers found, try parsing the whole content as one station
  if (results.length === 0 && content.includes('STATION_')) {
    results.push(parseStationBlock(content));
  }

  return results;
}

/**
 * Parse text file from File object
 */
export async function parseTextFileFromFile(file: File): Promise<ParsedStation[]> {
  const content = await file.text();
  return parseTextFile(content);
}
