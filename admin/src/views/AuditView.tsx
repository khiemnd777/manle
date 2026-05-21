import type { AuditLog } from '../api/client';

export default function AuditView({ logs }: { logs: AuditLog[] }) {
  return (
    <section className="panel">
      <h2>Audit Log</h2>
      <table>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.actorEmail || 'system'}</td>
              <td>{log.action}</td>
              <td>{log.targetType}:{log.targetId}</td>
              <td><code>{JSON.stringify(log.metadata)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
