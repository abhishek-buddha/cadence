// BulkImportInsuranceModal — Excel workbook bulk-import for payers.
//
// NOT YET MIGRATED: the original parsed the workbook client-side (xlsx) and
// sent parsed rows to a Convex mutation (insuranceContacts.bulkImportContacts)
// that matched/created patients + insurance contacts server-side.
// master-data-svc doesn't have a bulk-import endpoint yet — this renders a
// safe placeholder instead of crashing or silently doing nothing.

import { FileSpreadsheet, X } from 'lucide-react';
import Modal from './Modal';

export default function BulkImportInsuranceModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Upload Workbook">
      <div className="py-10 text-center">
        <FileSpreadsheet className="w-10 h-10 text-muted/40 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-900 mb-1">Not yet available</p>
        <p className="text-xs text-muted mb-6">
          Bulk payer import hasn't been ported to the new backend yet — add payers one at a time
          with "Add Payer" for now.
        </p>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>
    </Modal>
  );
}
