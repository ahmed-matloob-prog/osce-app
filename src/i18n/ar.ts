export default {
  // Common
  common: {
    appName: 'امتحان OSCE',
    loading: 'جاري التحميل...',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    submit: 'تقديم',
    next: 'التالي',
    previous: 'السابق',
    back: 'رجوع',
    confirm: 'تأكيد',
    search: 'بحث',
    clear: 'مسح',
    close: 'إغلاق',
    yes: 'نعم',
    no: 'لا',
    ok: 'موافق',
    error: 'خطأ',
    success: 'نجاح',
    warning: 'تحذير',
  },

  // Navigation
  nav: {
    dashboard: 'لوحة التحكم',
    exams: 'الامتحانات',
    candidates: 'الطلاب',
    reports: 'التقارير',
    settings: 'الإعدادات',
  },

  // Dashboard
  dashboard: {
    title: 'لوحة التحكم',
    startExam: 'بدء جلسة الامتحان',
    recentActivity: 'النشاط الأخير',
    todayStats: 'إحصائيات اليوم',
    candidatesEvaluated: 'الطلاب المقيّمون',
    stationsCompleted: 'المحطات المكتملة',
    pendingSync: 'بانتظار المزامنة',
  },

  // Exam Session
  session: {
    setupTitle: 'بدء جلسة الامتحان',
    selectExam: 'اختر الامتحان',
    selectCircuit: 'رقم الدائرة',
    selectStation: 'محطتك',
    examinerName: 'اسم الفاحص',
    startSession: 'بدء الجلسة',
    endSession: 'إنهاء الجلسة',
    currentStation: 'المحطة الحالية',
    noExams: 'لا توجد امتحانات. يرجى إنشاء امتحان أولاً.',
  },

  // Active Exam
  exam: {
    scenario: 'السيناريو',
    tasks: 'المهام',
    checklist: 'قائمة التحقق',
    examinationFindings: 'نتائج الفحص (اقرأ للطالب)',
    globalRating: 'التقييم العام',
    notes: 'ملاحظات',
    totalScore: 'الدرجة الكلية',
    submitEvaluation: 'تقديم التقييم',
    nextCandidate: 'الطالب التالي',
    timeRemaining: 'الوقت المتبقي',
    timeUp: 'انتهى الوقت!',
    scanCandidate: 'مسح الطالب',
    selectCandidate: 'اختر الطالب',
    candidateName: 'اسم الطالب',
  },

  // Scoring
  scoring: {
    competent: 'كفء',
    borderline: 'حدّي',
    incompetent: 'غير كفء',
    pass: 'ناجح',
    fail: 'راسب',
    clearFail: 'رسوب واضح',
    goodPass: 'ناجح جيد',
    excellent: 'ممتاز',
    notScored: 'غير مُقيّم',
  },

  // Candidates
  candidates: {
    title: 'الطلاب',
    addCandidate: 'إضافة طالب',
    importCSV: 'استيراد CSV',
    candidateNumber: 'رقم الطالب',
    name: 'الاسم',
    nameArabic: 'الاسم (عربي)',
    email: 'البريد الإلكتروني',
    group: 'المجموعة',
    stage: 'المرحلة',
    semester: 'الفصل الدراسي',
    noCandidates: 'لا يوجد طلاب. أضف أو استورد طلاب.',
    importSuccess: 'تم استيراد {{count}} طالب بنجاح',
    deleteConfirm: 'هل أنت متأكد من حذف هذا الطالب؟',
  },

  // Exams Management
  exams: {
    title: 'قوالب الامتحانات',
    createExam: 'إنشاء امتحان',
    editExam: 'تعديل الامتحان',
    examName: 'اسم الامتحان',
    description: 'الوصف',
    stations: 'المحطات',
    addStation: 'إضافة محطة',
    stationName: 'اسم المحطة',
    stationNumber: 'رقم المحطة',
    timeLimit: 'الوقت المحدد (دقائق)',
    checklistItems: 'عناصر التحقق',
    addItem: 'إضافة عنصر',
    deleteConfirm: 'هل أنت متأكد من حذف هذا الامتحان؟',
    noExams: 'لا توجد قوالب امتحانات. أنشئ امتحانك الأول.',
  },

  // Reports
  reports: {
    title: 'التقارير',
    generateReport: 'إنشاء تقرير',
    exportPDF: 'تصدير PDF',
    exportExcel: 'تصدير Excel',
    candidateReport: 'تقرير الطالب',
    examReport: 'تقرير الامتحان',
    circuitReport: 'تقرير الدائرة',
    selectExam: 'اختر الامتحان',
    selectCircuit: 'اختر الدائرة',
    dateRange: 'نطاق التاريخ',
    averageScore: 'متوسط الدرجات',
    passRate: 'نسبة النجاح',
    totalCandidates: 'إجمالي الطلاب',
  },

  // Settings
  settings: {
    title: 'الإعدادات',
    language: 'اللغة',
    english: 'English',
    arabic: 'العربية',
    autoSync: 'المزامنة التلقائية',
    soundAlerts: 'التنبيهات الصوتية',
    timerWarning: 'تحذير المؤقت (ثواني)',
    syncStatus: 'حالة المزامنة',
    lastSync: 'آخر مزامنة',
    pendingItems: 'العناصر المعلقة',
    syncNow: 'مزامنة الآن',
    clearData: 'مسح جميع البيانات',
    clearDataConfirm: 'سيتم حذف جميع البيانات المحلية. هل أنت متأكد؟',
  },

  // Sync Status
  sync: {
    online: 'متصل',
    offline: 'غير متصل',
    syncing: 'جاري المزامنة...',
    synced: 'تمت المزامنة',
    pendingSync: '{{count}} عناصر بانتظار المزامنة',
    lastSynced: 'آخر مزامنة: {{time}}',
    never: 'أبداً',
  },

  // Scanner
  scanner: {
    title: 'مسح الطالب',
    scanning: 'جاري المسح...',
    pointCamera: 'وجّه الكاميرا نحو رمز QR أو الباركود',
    manualEntry: 'إدخال يدوي',
    candidateFound: 'تم العثور على الطالب',
    candidateNotFound: 'لم يتم العثور على الطالب',
    tryAgain: 'حاول مرة أخرى',
    cameraPermission: 'صلاحية الكاميرا مطلوبة',
    enableCamera: 'يرجى تفعيل صلاحية الكاميرا لمسح الرموز',
  },

  // Validation
  validation: {
    required: 'هذا الحقل مطلوب',
    invalidEmail: 'عنوان بريد إلكتروني غير صالح',
    minLength: 'الحد الأدنى {{min}} أحرف مطلوبة',
    maxLength: 'الحد الأقصى {{max}} أحرف مسموح',
  },

  // Errors
  errors: {
    generic: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
    loadFailed: 'فشل تحميل البيانات',
    saveFailed: 'فشل حفظ البيانات',
    deleteFailed: 'فشل الحذف',
    syncFailed: 'فشلت المزامنة. ستتم إعادة المحاولة عند الاتصال.',
    cameraError: 'خطأ في الكاميرا. يرجى التحقق من الصلاحيات.',
  },
};
