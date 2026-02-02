import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useExamStore } from '../stores/examStore';
import type { Station, ChecklistItem, StationType, ScoringPresetKey, ScoringOption } from '../types';
import { SCORING_PRESETS } from '../types';

// Lazy load import modal
const StationImportModal = lazy(() => import('../components/import/StationImportModal'));

// Station type labels
const STATION_TYPE_LABELS: Record<StationType, { label: string; beforeLabel: string; afterLabel: string; showFindings: boolean }> = {
  history: {
    label: 'History Taking (HX)',
    beforeLabel: 'History Items',
    afterLabel: 'DDX & Investigations',
    showFindings: true,
  },
  examination: {
    label: 'Physical Examination',
    beforeLabel: 'Examination Maneuvers',
    afterLabel: 'DDX & Investigations',
    showFindings: false,
  },
  procedure: {
    label: 'Procedure / Skill',
    beforeLabel: 'Procedure Steps',
    afterLabel: 'Post-procedure Items',
    showFindings: false,
  },
  communication: {
    label: 'Communication / Counseling',
    beforeLabel: 'Communication Items',
    afterLabel: 'Additional Items',
    showFindings: false,
  },
};

// Default empty station
const createEmptyStation = (stationNumber: number): Station => ({
  id: uuidv4(),
  stationNumber,
  stationType: 'history',
  name: '',
  scenario: '',
  tasks: [''],
  timeLimit: 600, // 10 minutes default
  checklistItems: [],
  examinationFindings: '',
  globalRatingEnabled: true,
});

// Default empty checklist item
const createEmptyChecklistItem = (position: 'before_findings' | 'after_findings' = 'before_findings'): ChecklistItem => ({
  id: uuidv4(),
  text: '',
  category: '',
  scoringOptions: SCORING_PRESETS.standard.options.map(o => ({ ...o })),
  maxScore: SCORING_PRESETS.standard.maxScore,
  position,
});

export default function ExamBuilder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: examId } = useParams<{ id: string }>();
  const { exams, loadExams, addExam, updateExam, deleteExam } = useExamStore();

  const [examName, setExamName] = useState('');
  const [examNameAr, setExamNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [stations, setStations] = useState<Station[]>([createEmptyStation(1)]);
  const [activeStationIndex, setActiveStationIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isLoading, setIsLoading] = useState(!!examId);

  // Load existing exam data when editing
  useEffect(() => {
    const loadExamData = async () => {
      if (!examId) return;

      setIsLoading(true);

      // Make sure exams are loaded
      if (exams.length === 0) {
        await loadExams();
      }
    };

    loadExamData();
  }, [examId, loadExams]);

  // Populate form when exam data is available
  useEffect(() => {
    if (!examId || exams.length === 0) return;

    const existingExam = exams.find(e => e.id === examId);
    if (existingExam) {
      setExamName(existingExam.name);
      setExamNameAr(existingExam.nameAr || '');
      setDescription(existingExam.description || '');
      setStations(existingExam.stations.length > 0 ? existingExam.stations : [createEmptyStation(1)]);
      setIsLoading(false);
    } else {
      // Exam not found, redirect to exams list
      setIsLoading(false);
      navigate('/exams');
    }
  }, [examId, exams, navigate]);

  const activeStation = stations[activeStationIndex];

  // Handle imported stations from Word documents
  const handleImportStations = (importedStations: Partial<Station>[]) => {
    const newStations: Station[] = importedStations.map((imported, index) => ({
      id: imported.id || uuidv4(),
      stationNumber: stations.length + index + 1,
      stationType: imported.stationType || 'history',
      name: imported.name || '',
      nameAr: imported.nameAr,
      scenario: imported.scenario || '',
      scenarioAr: imported.scenarioAr,
      tasks: imported.tasks?.length ? imported.tasks : [''],
      tasksAr: imported.tasksAr,
      timeLimit: imported.timeLimit || 600,
      checklistItems: imported.checklistItems || [],
      examinationFindings: imported.examinationFindings,
      examinationFindingsAr: imported.examinationFindingsAr,
      globalRatingEnabled: imported.globalRatingEnabled ?? true,
    }));

    // If we only have one empty station, replace it
    if (stations.length === 1 && !stations[0].name && stations[0].checklistItems.length === 0) {
      // Renumber imported stations starting from 1
      newStations.forEach((s, i) => s.stationNumber = i + 1);
      setStations(newStations);
    } else {
      setStations([...stations, ...newStations]);
    }

    setShowImportModal(false);
    setActiveStationIndex(stations.length === 1 && !stations[0].name ? 0 : stations.length);
  };

  // Update station field
  const updateStation = (index: number, updates: Partial<Station>) => {
    setStations(stations.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  // Add new station
  const addStation = () => {
    const newStation = createEmptyStation(stations.length + 1);
    setStations([...stations, newStation]);
    setActiveStationIndex(stations.length);
  };

  // Remove station
  const removeStation = (index: number) => {
    if (stations.length === 1) return;
    const newStations = stations.filter((_, i) => i !== index);
    // Renumber stations
    newStations.forEach((s, i) => (s.stationNumber = i + 1));
    setStations(newStations);
    setActiveStationIndex(Math.min(activeStationIndex, newStations.length - 1));
  };

  // Add checklist item to active station
  const addChecklistItem = (position: 'before_findings' | 'after_findings' = 'before_findings') => {
    const newItem = createEmptyChecklistItem(position);
    updateStation(activeStationIndex, {
      checklistItems: [...activeStation.checklistItems, newItem],
    });
  };

  // Update checklist item
  const updateChecklistItem = (itemIndex: number, updates: Partial<ChecklistItem>) => {
    const newItems = activeStation.checklistItems.map((item, i) =>
      i === itemIndex ? { ...item, ...updates } : item
    );
    updateStation(activeStationIndex, { checklistItems: newItems });
  };

  // Remove checklist item
  const removeChecklistItem = (itemIndex: number) => {
    const newItems = activeStation.checklistItems.filter((_, i) => i !== itemIndex);
    updateStation(activeStationIndex, { checklistItems: newItems });
  };

  // Change scoring preset for an item
  const changeScoringPreset = (itemIndex: number, presetKey: ScoringPresetKey | 'custom') => {
    if (presetKey === 'custom') {
      // For custom, we keep the current options but allow editing
      return;
    }

    const preset = SCORING_PRESETS[presetKey];
    const scoringOptions: ScoringOption[] = preset.options.map(o => ({ ...o }));
    updateChecklistItem(itemIndex, { scoringOptions, maxScore: preset.maxScore });
  };

  // Get current preset key based on scoring options
  const getCurrentPresetKey = (item: ChecklistItem): ScoringPresetKey | 'custom' => {
    const optionValues = item.scoringOptions.map(o => o.value).sort((a, b) => b - a).join(',');

    for (const [key, preset] of Object.entries(SCORING_PRESETS)) {
      const presetValues = preset.options.map(o => o.value).sort((a, b) => b - a).join(',');
      if (optionValues === presetValues) {
        return key as ScoringPresetKey;
      }
    }
    return 'custom';
  };

  // State for tracking which item is being edited for custom scoring
  const [editingScoringItemIndex, setEditingScoringItemIndex] = useState<number | null>(null);

  // Update a specific scoring option
  const updateScoringOption = (itemIndex: number, optionIndex: number, value: number) => {
    const item = activeStation.checklistItems[itemIndex];
    const newOptions = item.scoringOptions.map((opt, i) =>
      i === optionIndex ? { ...opt, value } : opt
    );
    const maxScore = Math.max(...newOptions.map(o => o.value));
    updateChecklistItem(itemIndex, { scoringOptions: newOptions, maxScore });
  };

  // Add a new scoring option to an item
  const addScoringOption = (itemIndex: number) => {
    const item = activeStation.checklistItems[itemIndex];
    const newOptions = [
      ...item.scoringOptions,
      { value: item.maxScore + 1, label: `Score ${item.maxScore + 1}` },
    ].sort((a, b) => b.value - a.value);
    const maxScore = Math.max(...newOptions.map(o => o.value));
    updateChecklistItem(itemIndex, { scoringOptions: newOptions, maxScore });
  };

  // Remove a scoring option from an item
  const removeScoringOption = (itemIndex: number, optionIndex: number) => {
    const item = activeStation.checklistItems[itemIndex];
    if (item.scoringOptions.length <= 2) return; // Minimum 2 options
    const newOptions = item.scoringOptions.filter((_, i) => i !== optionIndex);
    const maxScore = Math.max(...newOptions.map(o => o.value));
    updateChecklistItem(itemIndex, { scoringOptions: newOptions, maxScore });
  };

  // Update task
  const updateTask = (taskIndex: number, value: string) => {
    const newTasks = [...activeStation.tasks];
    newTasks[taskIndex] = value;
    updateStation(activeStationIndex, { tasks: newTasks });
  };

  // Add task
  const addTask = () => {
    updateStation(activeStationIndex, { tasks: [...activeStation.tasks, ''] });
  };

  // Remove task
  const removeTask = (taskIndex: number) => {
    if (activeStation.tasks.length === 1) return;
    const newTasks = activeStation.tasks.filter((_, i) => i !== taskIndex);
    updateStation(activeStationIndex, { tasks: newTasks });
  };

  // Delete exam
  const handleDelete = async () => {
    if (!examId) return;

    const confirmed = confirm(t('exams.deleteConfirm', 'Are you sure you want to delete this exam? This action cannot be undone.'));
    if (!confirmed) return;

    try {
      await deleteExam(examId);
      navigate('/exams');
    } catch (error) {
      console.error('Failed to delete exam:', error);
      alert(t('errors.deleteFailed', 'Failed to delete exam'));
    }
  };

  // Save exam
  const handleSave = async () => {
    if (!examName.trim()) {
      alert(t('validation.required'));
      return;
    }

    setIsSaving(true);
    try {
      const examData = {
        name: examName.trim(),
        nameAr: examNameAr.trim() || undefined,
        description: description.trim(),
        stations: stations.filter(s => s.name.trim()), // Only save stations with names
      };

      if (examId) {
        // Update existing exam
        await updateExam(examId, examData);
      } else {
        // Create new exam
        await addExam(examData);
      }
      navigate('/exams');
    } catch (error) {
      console.error('Failed to save exam:', error);
      alert(t('errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  // Show loading state when loading existing exam
  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-3 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {examId ? t('exams.editExam', 'Edit Exam') : t('exams.createExam')}
        </h1>
        <div className="flex gap-2">
          {examId && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              {t('common.delete', 'Delete')}
            </button>
          )}
          <button
            onClick={() => navigate('/exams')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Exam Info & Stations List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Exam Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-4">{t('exams.examName')}</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="Mid Exam 2nd Stage"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="text"
                value={examNameAr}
                onChange={(e) => setExamNameAr(e.target.value)}
                placeholder="الاسم بالعربي (اختياري)"
                dir="rtl"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('exams.description')}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Stations List */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t('exams.stations')}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="text-green-600 hover:text-green-700 text-sm font-medium"
                >
                  📄 Import
                </button>
                <button
                  onClick={addStation}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  + {t('exams.addStation')}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {stations.map((station, index) => (
                <div
                  key={station.id}
                  onClick={() => setActiveStationIndex(index)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    index === activeStationIndex
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      Station {station.stationNumber}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {station.name || 'Untitled'}
                    </div>
                  </div>
                  {stations.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStation(index);
                      }}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Station Editor */}
        <div className="lg:col-span-2 space-y-4">
          {/* Station Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-4">
              Station {activeStation.stationNumber} Details
            </h2>

            {/* Station Type Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Station Type
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATION_TYPE_LABELS) as StationType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => updateStation(activeStationIndex, { stationType: type })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeStation.stationType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {STATION_TYPE_LABELS[type].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('exams.stationName')}
                </label>
                <input
                  type="text"
                  value={activeStation.name}
                  onChange={(e) => updateStation(activeStationIndex, { name: e.target.value })}
                  placeholder={activeStation.stationType === 'history' ? 'HX - Chest Pain' : 'Exam - Edema'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('exams.timeLimit')}
                </label>
                <input
                  type="number"
                  value={activeStation.timeLimit / 60}
                  onChange={(e) => updateStation(activeStationIndex, { timeLimit: Number(e.target.value) * 60 })}
                  min={1}
                  max={30}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Scenario */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('exam.scenario')}
            </label>
            <textarea
              value={activeStation.scenario}
              onChange={(e) => updateStation(activeStationIndex, { scenario: e.target.value })}
              placeholder="62 years male, presented with chest discomfort"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">{t('exam.tasks')}</label>
              <button
                onClick={addTask}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                + Add Task
              </button>
            </div>
            <div className="space-y-2">
              {activeStation.tasks.map((task, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-gray-400 py-2">{index + 1}.</span>
                  <input
                    type="text"
                    value={task}
                    onChange={(e) => updateTask(index, e.target.value)}
                    placeholder="Take focused history"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {activeStation.tasks.length > 1 && (
                    <button
                      onClick={() => removeTask(index)}
                      className="text-red-500 hover:text-red-700 px-2"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Checklist Items - BEFORE Findings (or main items for exam stations) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-gray-700">
                📋 {STATION_TYPE_LABELS[activeStation.stationType || 'history'].beforeLabel}
              </label>
              <button
                onClick={() => addChecklistItem('before_findings')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm"
              >
                + Add Item
              </button>
            </div>

            {activeStation.checklistItems.filter(i => i.position !== 'after_findings').length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                <p>No items yet. Add {activeStation.stationType === 'examination' ? 'examination maneuvers' : 'checklist items'}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStation.checklistItems.map((item, index) => {
                  if (item.position === 'after_findings') return null;
                  return (
                    <div
                      key={item.id}
                      className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                    >
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => updateChecklistItem(index, { text: e.target.value })}
                          placeholder="Site (substernal)"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          onClick={() => removeChecklistItem(index)}
                          className="text-red-500 hover:text-red-700 px-2"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <input
                          type="text"
                          value={item.category || ''}
                          onChange={(e) => updateChecklistItem(index, { category: e.target.value })}
                          placeholder="Category (e.g., History)"
                          className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <select
                          value={getCurrentPresetKey(item)}
                          onChange={(e) => changeScoringPreset(index, e.target.value as ScoringPresetKey | 'custom')}
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {Object.entries(SCORING_PRESETS).map(([key, preset]) => (
                            <option key={key} value={key}>{preset.label}</option>
                          ))}
                          <option value="custom">Custom</option>
                        </select>
                        {/* Show current scoring values with edit button */}
                        <button
                          onClick={() => setEditingScoringItemIndex(editingScoringItemIndex === index ? null : index)}
                          className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          [{item.scoringOptions.map(o => o.value).join('/')}] ✏️
                        </button>
                      </div>
                      {/* Custom scoring editor */}
                      {editingScoringItemIndex === index && (
                        <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="text-xs font-medium text-blue-700 mb-2">Edit Scoring Options:</div>
                          <div className="flex flex-wrap gap-2 items-center">
                            {item.scoringOptions.map((opt, optIndex) => (
                              <div key={optIndex} className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={opt.value}
                                  onChange={(e) => updateScoringOption(index, optIndex, parseInt(e.target.value) || 0)}
                                  min={0}
                                  max={10}
                                  className="w-12 border border-blue-300 rounded px-1 py-0.5 text-xs text-center"
                                />
                                {item.scoringOptions.length > 2 && (
                                  <button
                                    onClick={() => removeScoringOption(index, optIndex)}
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => addScoringOption(index)}
                              className="text-blue-600 hover:text-blue-700 text-xs px-2 py-0.5 border border-blue-300 rounded"
                            >
                              +
                            </button>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">
                            Max: {item.maxScore} | Values will be sorted high→low
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Examination Findings - Only for History stations */}
          {STATION_TYPE_LABELS[activeStation.stationType || 'history'].showFindings && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <label className="block text-sm font-medium text-amber-700 mb-2">
                📋 {t('exam.examinationFindings')}
              </label>
              <textarea
                value={activeStation.examinationFindings || ''}
                onChange={(e) => updateStation(activeStationIndex, { examinationFindings: e.target.value })}
                placeholder="Vitals: BP 160/95 mmHg, HR 110 bpm, RR: 24, SpO2: 92%..."
                rows={3}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
              />
              <p className="text-xs text-amber-600 mt-2">
                This will be displayed for the examiner to read to the student
              </p>
            </div>
          )}

          {/* Checklist Items - AFTER Findings (DDX, Investigations, etc.) */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-gray-700">
                📋 {STATION_TYPE_LABELS[activeStation.stationType || 'history'].afterLabel}
              </label>
              <button
                onClick={() => addChecklistItem('after_findings')}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm"
              >
                + Add Item
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Add DDX, Investigations, Clinical reasoning, Diagnosis items here
            </p>

            {activeStation.checklistItems.filter(i => i.position === 'after_findings').length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                <p>No items yet. Add DDX, investigations, etc.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStation.checklistItems.map((item, index) => {
                  if (item.position !== 'after_findings') return null;
                  return (
                    <div
                      key={item.id}
                      className="border border-green-200 rounded-lg p-3 bg-green-50"
                    >
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => updateChecklistItem(index, { text: e.target.value })}
                          placeholder="DDX: acute coronary syndrome"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <button
                          onClick={() => removeChecklistItem(index)}
                          className="text-red-500 hover:text-red-700 px-2"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <input
                          type="text"
                          value={item.category || ''}
                          onChange={(e) => updateChecklistItem(index, { category: e.target.value })}
                          placeholder="Category (e.g., DDX)"
                          className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <select
                          value={getCurrentPresetKey(item)}
                          onChange={(e) => changeScoringPreset(index, e.target.value as ScoringPresetKey | 'custom')}
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        >
                          {Object.entries(SCORING_PRESETS).map(([key, preset]) => (
                            <option key={key} value={key}>{preset.label}</option>
                          ))}
                          <option value="custom">Custom</option>
                        </select>
                        {/* Show current scoring values with edit button */}
                        <button
                          onClick={() => setEditingScoringItemIndex(editingScoringItemIndex === index ? null : index)}
                          className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                        >
                          [{item.scoringOptions.map(o => o.value).join('/')}] ✏️
                        </button>
                      </div>
                      {/* Custom scoring editor */}
                      {editingScoringItemIndex === index && (
                        <div className="mt-2 p-2 bg-green-100 rounded-lg border border-green-300">
                          <div className="text-xs font-medium text-green-700 mb-2">Edit Scoring Options:</div>
                          <div className="flex flex-wrap gap-2 items-center">
                            {item.scoringOptions.map((opt, optIndex) => (
                              <div key={optIndex} className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={opt.value}
                                  onChange={(e) => updateScoringOption(index, optIndex, parseInt(e.target.value) || 0)}
                                  min={0}
                                  max={10}
                                  className="w-12 border border-green-300 rounded px-1 py-0.5 text-xs text-center"
                                />
                                {item.scoringOptions.length > 2 && (
                                  <button
                                    onClick={() => removeScoringOption(index, optIndex)}
                                    className="text-red-500 hover:text-red-700 text-xs"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => addScoringOption(index)}
                              className="text-green-600 hover:text-green-700 text-xs px-2 py-0.5 border border-green-300 rounded"
                            >
                              +
                            </button>
                          </div>
                          <div className="text-xs text-green-600 mt-1">
                            Max: {item.maxScore} | Values will be sorted high→low
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Global Rating Toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={activeStation.globalRatingEnabled}
                onChange={(e) => updateStation(activeStationIndex, { globalRatingEnabled: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-700">
                Enable {t('exam.globalRating')} (0-4 scale)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-3 text-gray-600">Loading...</p>
            </div>
          </div>
        }>
          <StationImportModal
            onImport={handleImportStations}
            onClose={() => setShowImportModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
