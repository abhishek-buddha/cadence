function marker(name) {
  return { __cadenceCompatName: name };
}

export const api = {
  dashboard: { getStats: marker('dashboard.getStats') },
  claims: {
    list: marker('claims.list'),
    getById: marker('claims.getById'),
    updateStatus: marker('claims.updateStatus'),
    bulkRemove: marker('claims.bulkRemove'),
  },
  patients: { list: marker('patients.list') },
  insuranceContacts: {
    list: marker('insuranceContacts.list'),
    getById: marker('insuranceContacts.getById'),
  },
  providers: { list: marker('providers.list') },
  calls: {
    listRecent: marker('calls.listRecent'),
    getRecordingUrls: marker('calls.getRecordingUrls'),
  },
  callResults: {
    listLatestByUser: marker('callResults.listLatestByUser'),
    getByCall: marker('callResults.getByCall'),
  },
  users: {
    list: marker('users.list'),
    create: marker('users.create'),
    updateRole: marker('users.updateRole'),
    setStatus: marker('users.setStatus'),
    updateRoutingProfile: marker('users.updateRoutingProfile'),
  },
  userGroups: {
    list: marker('userGroups.list'),
    remove: marker('userGroups.remove'),
  },
  reports: {
    successRate: marker('reports.successRate'),
    successRateByPayer: marker('reports.successRateByPayer'),
    successRateByWeek: marker('reports.successRateByWeek'),
    dataAccuracy: marker('reports.dataAccuracy'),
    turnaroundTime: marker('reports.turnaroundTime'),
    holdMetrics: marker('reports.holdMetrics'),
    operationalKpis: marker('reports.operationalKpis'),
    exceptionReport: marker('reports.exceptionReport'),
    volumeByTier: marker('reports.volumeByTier'),
  },  claimImport: {
    processExcelData: marker('claimImport.processExcelData'),
    bulkImportClaims: marker('claimImport.bulkImportClaims'),
    aiAutofillClaim: marker('claimImport.aiAutofillClaim'),
  },
};
