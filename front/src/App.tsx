import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { WorkbenchView } from './views/workbench/WorkbenchView';
import { BatchImportView } from './views/batch/BatchImportView';
import { ErpSandboxView } from './views/erp/ErpSandboxView';
import { MasterDataView } from './views/erp/MasterDataView';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/workbench" replace />} />
          <Route path="workbench" element={<WorkbenchView />} />
          <Route path="batch" element={<BatchImportView />} />
          <Route path="erp" element={<ErpSandboxView />} />
          <Route path="master-data" element={<MasterDataView />} />
          <Route path="*" element={<Navigate to="/workbench" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
