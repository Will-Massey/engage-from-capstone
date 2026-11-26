import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import { hasFullAccess } from '../../constants/roles';
import { useAuthStore } from '../../stores/authStore';

type UsageGroup = {
  userId: string;
  userName: string;
  seconds: number;
  minutes: number;
  estimatedCostUsd: number;
  day?: string;
  month?: string;
};

type UsagePayload = {
  costBasis: string;
  usdPerMinute: number;
  totals: { seconds: number; minutes: number; estimatedCostUsd: number };
  byDay: UsageGroup[];
  byMonth: UsageGroup[];
};

type AccessUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  voiceAssistantEnabled: boolean;
};

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export default function VoiceUsage() {
  const role = useAuthStore((state) => state.user?.role);
  const allowed = hasFullAccess(role);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all([
      apiClient.get<UsagePayload>('/voice/usage'),
      apiClient.get<AccessUser[]>('/voice/access/users'),
    ])
      .then(([usageRes, usersRes]) => {
        if (cancelled) return;
        setUsage(usageRes.data);
        setUsers(usersRes.data ?? []);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(err?.message || 'Usage could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  async function toggle(user: AccessUser) {
    const next = !user.voiceAssistantEnabled;
    await apiClient.patch(`/voice/access/${user.id}`, { enabled: next });
    setUsers((list) =>
      list.map((item) => (item.id === user.id ? { ...item, voiceAssistantEnabled: next } : item))
    );
  }

  if (!allowed) {
    return (
      <p className="p-6 text-sm text-slate-600 dark:text-slate-300">Voice usage is for an admin.</p>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Voice usage</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Minutes and estimated cost by day and by month. The cost is an estimate
          {usage ? ` at $${usage.usdPerMinute.toFixed(2)} a minute` : ''}. It is not an invoice.
        </p>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {usage && (
        <div className="card p-4">
          <p className="text-sm text-slate-500">Practice total ({usage.costBasis})</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {usage.totals.minutes} min
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {money(usage.totals.estimatedCostUsd)} estimated
          </p>
        </div>
      )}
      <section className="card p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold mb-2">By day</h2>
        <UsageTable rows={usage?.byDay ?? []} periodKey="day" periodLabel="Day" />
      </section>
      <section className="card p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold mb-2">By month</h2>
        <UsageTable rows={usage?.byMonth ?? []} periodKey="month" periodLabel="Month" />
      </section>
      <section className="card p-4">
        <h2 className="text-sm font-semibold mb-2">Who can use the assistant</h2>
        <p className="text-sm text-slate-500 mb-3">
          Off for everyone until you switch a person on.
        </p>
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {users.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">
                {user.firstName} {user.lastName}
                <span className="text-slate-500"> · {user.email}</span>
              </span>
              <button
                type="button"
                className="btn-secondary min-h-11 px-3 text-sm"
                onClick={() => void toggle(user).catch(() => setError('The switch did not save.'))}
              >
                {user.voiceAssistantEnabled ? 'On' : 'Off'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function UsageTable({
  rows,
  periodKey,
  periodLabel,
}: {
  rows: UsageGroup[];
  periodKey: 'day' | 'month';
  periodLabel: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No voice sessions yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 pr-3">{periodLabel}</th>
          <th className="py-1 pr-3">Person</th>
          <th className="py-1 pr-3">Minutes</th>
          <th className="py-1">Estimated cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row[periodKey]}-${row.userId}`}
            className="border-t border-slate-200 dark:border-slate-700"
          >
            <td className="py-1 pr-3">{row[periodKey]}</td>
            <td className="py-1 pr-3">{row.userName}</td>
            <td className="py-1 pr-3">{row.minutes}</td>
            <td className="py-1">{money(row.estimatedCostUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
