import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { UsersRound, Pencil, Trash2 } from 'lucide-react';
import EmptyState from './EmptyState';
import UserGroupModal from './UserGroupModal';
import { SPECIALIZATION_LABELS } from '../constants/specializations';

export default function UserGroupsTab() {
  const groups = useQuery(api.userGroups.list);
  const users = useQuery(api.users.list);
  const insuranceContacts = useQuery(api.insuranceContacts.list);
  const providers = useQuery(api.providers.list);
  const removeGroup = useMutation(api.userGroups.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const isLoading = groups === undefined || users === undefined;

  const insuranceMap = {};
  (insuranceContacts ?? []).forEach((c) => { insuranceMap[c._id] = c.name; });
  const providerMap = {};
  (providers ?? []).forEach((p) => { providerMap[p._id] = p.practiceName; });

  function memberCount(groupId) {
    return (users ?? []).filter((u) => u.userGroupId === groupId).length;
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(group) {
    setEditing(group);
    setModalOpen(true);
  }

  async function handleDelete(group) {
    const count = memberCount(group._id);
    const warning = count > 0
      ? `Delete "${group.name}"? ${count} member${count !== 1 ? 's' : ''} will be moved back to Custom assignment.`
      : `Delete "${group.name}"?`;
    if (!window.confirm(warning)) return;
    setDeletingId(group._id);
    try {
      await removeGroup({ id: group._id });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {!isLoading && `${groups.length} group${groups.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <UsersRound className="w-4 h-4" />
          Add Group
        </button>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-white">
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Name</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Payer</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Provider</th>
              <th className="text-left px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Specialization</th>
              <th className="text-center px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Members</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Edit</th>
              <th className="text-right px-4 py-3.5 text-xs uppercase tracking-wider text-muted font-semibold whitespace-nowrap">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="shimmer rounded h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={UsersRound}
                    title="No user groups yet"
                    description="Create a group to bundle Payer, Provider, and Specialization scope for a team of users."
                    action={
                      <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <UsersRound className="w-4 h-4" />
                        Add Group
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const insuranceNames = (group.insuranceContactIds ?? []).map((id) => insuranceMap[id]).filter(Boolean);
                const providerNames = (group.providerIds ?? []).map((id) => providerMap[id]).filter(Boolean);
                const specLabels = (group.specializations ?? []).map((s) => SPECIALIZATION_LABELS[s] ?? s);
                return (
                  <tr key={group._id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-sm text-gray-900 font-medium whitespace-nowrap">{group.name}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {insuranceNames.length > 0 ? insuranceNames.join(', ') : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {providerNames.length > 0 ? providerNames.join(', ') : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {specLabels.length > 0 ? specLabels.join(', ') : '--'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 text-center whitespace-nowrap">
                      {memberCount(group._id)}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(group)}
                        className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(group)}
                        disabled={deletingId === group._id}
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <UserGroupModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        insuranceContacts={insuranceContacts}
        providers={providers}
        users={users}
        groups={groups}
      />
    </div>
  );
}
