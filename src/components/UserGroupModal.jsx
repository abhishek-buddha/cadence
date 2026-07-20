import { useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { SPECIALIZATION_OPTIONS } from '../constants/specializations';

const INPUT_CLASS =
  'w-full bg-white border border-border-light rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none';
const LABEL_CLASS = 'block text-xs uppercase tracking-wider text-muted font-medium mb-1.5';

const EMPTY_FORM = {
  name: '',
  insuranceContactIds: [],
  providerIds: [],
  specializations: [],
};

const SELECT_TABS = [
  { key: 'payer', label: 'Payer' },
  { key: 'provider', label: 'Provider' },
];

function membersOf(users, groupId) {
  return (users ?? []).filter((u) => u.userGroupId === groupId).map((u) => u._id);
}

export default function UserGroupModal({ open, onClose, editing, insuranceContacts, providers, users, groups }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [memberIds, setMemberIds] = useState([]);
  const [selectTab, setSelectTab] = useState('payer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const createGroup = useMutation(api.userGroups.create);
  const updateGroup = useMutation(api.userGroups.update);
  const addMember = useMutation(api.userGroups.addMember);
  const removeMember = useMutation(api.userGroups.removeMember);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectTab('payer');
    setForm(
      editing
        ? {
            name: editing.name,
            insuranceContactIds: editing.insuranceContactIds ?? [],
            providerIds: editing.providerIds ?? [],
            specializations: editing.specializations ?? [],
          }
        : EMPTY_FORM
    );
    setMemberIds(editing ? membersOf(users, editing._id) : []);
  }, [open, editing, users]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleInsurance(id) {
    setForm((prev) => ({
      ...prev,
      insuranceContactIds: prev.insuranceContactIds.includes(id)
        ? prev.insuranceContactIds.filter((i) => i !== id)
        : [...prev.insuranceContactIds, id],
    }));
  }

  function toggleProvider(id) {
    setForm((prev) => ({
      ...prev,
      providerIds: prev.providerIds.includes(id)
        ? prev.providerIds.filter((i) => i !== id)
        : [...prev.providerIds, id],
    }));
  }

  function toggleSpecialization(value) {
    setForm((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(value)
        ? prev.specializations.filter((s) => s !== value)
        : [...prev.specializations, value],
    }));
  }

  function toggleMember(userId) {
    setMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Please enter a group name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        insuranceContactIds: form.insuranceContactIds,
        providerIds: form.providerIds,
        specializations: form.specializations,
      };

      let groupId = editing?._id;
      if (editing) {
        await updateGroup({ id: editing._id, ...payload });
      } else {
        groupId = await createGroup(payload);
      }

      const originalMemberIds = editing ? membersOf(users, editing._id) : [];
      const toAdd = memberIds.filter((id) => !originalMemberIds.includes(id));
      const toRemove = originalMemberIds.filter((id) => !memberIds.includes(id));
      await Promise.all([
        ...toAdd.map((userId) => addMember({ groupId, userId })),
        ...toRemove.map((userId) => removeMember({ userId })),
      ]);

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save group.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit User Group' : 'Create User Group'} wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={LABEL_CLASS}>Group Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Payer Support Team"
            className={INPUT_CLASS}
            required
            autoFocus
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Specialization</label>
          <div className="grid grid-cols-3 gap-2">
            {SPECIALIZATION_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  form.specializations.includes(opt.value)
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.specializations.includes(opt.value)}
                  onChange={() => toggleSpecialization(opt.value)}
                  className="rounded border-border-light text-accent focus:ring-accent"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Payer / Provider this group can handle</label>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-1 border-b border-border bg-surface px-2">
              {SELECT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectTab(tab.key)}
                  className={`relative px-3 py-2 text-xs font-medium transition-colors ${
                    selectTab === tab.key ? 'text-accent' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                  {tab.key === 'payer' && form.insuranceContactIds.length > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted">({form.insuranceContactIds.length})</span>
                  )}
                  {tab.key === 'provider' && form.providerIds.length > 0 && (
                    <span className="ml-1.5 text-[10px] text-muted">({form.providerIds.length})</span>
                  )}
                  {selectTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-3">
              {selectTab === 'payer' && (
                (insuranceContacts ?? []).length === 0 ? (
                  <p className="text-xs text-muted italic">No payers in Master Data yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {(insuranceContacts ?? []).map((c) => (
                      <label
                        key={c._id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          form.insuranceContactIds.includes(c._id)
                            ? 'border-accent bg-accent/5'
                            : 'border-border hover:border-accent/40 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.insuranceContactIds.includes(c._id)}
                          onChange={() => toggleInsurance(c._id)}
                          className="rounded border-border-light text-accent focus:ring-accent"
                        />
                        <span className="text-sm text-gray-700 truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )
              )}

              {selectTab === 'provider' && (
                (providers ?? []).length === 0 ? (
                  <p className="text-xs text-muted italic">No providers in Master Data yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {(providers ?? []).map((p) => (
                      <label
                        key={p._id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          form.providerIds.includes(p._id)
                            ? 'border-accent bg-accent/5'
                            : 'border-border hover:border-accent/40 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.providerIds.includes(p._id)}
                          onChange={() => toggleProvider(p._id)}
                          className="rounded border-border-light text-accent focus:ring-accent"
                        />
                        <span className="text-sm text-gray-700 truncate">{p.practiceName}</span>
                      </label>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Members</label>
          <div className="border border-border rounded-lg p-3 max-h-56 overflow-y-auto space-y-1">
            {(users ?? []).length === 0 ? (
              <p className="text-xs text-muted italic">No users yet.</p>
            ) : (
              users.map((u) => {
                const inAnotherGroup = u.userGroupId && u.userGroupId !== editing?._id;
                const otherGroupName = inAnotherGroup
                  ? (groups ?? []).find((g) => g._id === u.userGroupId)?.name
                  : null;
                return (
                  <label
                    key={u._id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u._id)}
                      onChange={() => toggleMember(u._id)}
                      className="rounded border-border-light text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-gray-700">{u.name || u.email}</span>
                    {otherGroupName && !memberIds.includes(u._id) && (
                      <span className="text-xs text-muted italic ml-auto">(currently in {otherGroupName})</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
