import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { EntitlementDefinition, EntitlementGrant } from '../api/client';
import type { AdminData } from '../adminTypes';
import {
  Switcher,
  messageFromError,
  useFeedbackState,
} from '../adminShared';

export default function EntitlementsView({ data, reload }: { data: AdminData; reload: () => Promise<void> }) {
  const [message, setMessage] = useFeedbackState('success');
  const [error, setError] = useFeedbackState('error');
  const [savingKey, setSavingKey] = useState('');
  const grantMap = useMemo(() => {
    const map = new Map<string, EntitlementGrant>();
    data.entitlementGrants.forEach(grant => map.set(`${grant.tierCode}:${grant.entitlementKey}`, grant));
    return map;
  }, [data.entitlementGrants]);

  function entitlementValue(def: EntitlementDefinition, grant?: EntitlementGrant) {
    const value = grant?.value ?? def.defaultValue;
    if (def.valueType === 'number') return Number(value || 0);
    if (def.valueType === 'boolean') return value === true || value === 'true';
    return String(value ?? '');
  }

  function switchChecked(def: EntitlementDefinition, grant?: EntitlementGrant) {
    const enabled = grant?.enabled ?? true;
    if (def.valueType === 'boolean') return enabled && entitlementValue(def, grant) === true;
    return enabled;
  }

  async function saveToggle(tierCode: string, def: EntitlementDefinition, grant: EntitlementGrant | undefined, checked: boolean, input: HTMLInputElement) {
    const cellKey = `${tierCode}:${def.key}`;
    const value = def.valueType === 'boolean' ? checked : entitlementValue(def, grant);
    setError('');
    setMessage('');
    setSavingKey(cellKey);
    try {
      await api.updateTierEntitlement(tierCode, def.key, { enabled: checked, value });
      setMessage('Entitlement saved.');
      await reload();
    } catch (err) {
      input.checked = !checked;
      setError(messageFromError(err));
    } finally {
      setSavingKey('');
    }
  }

  return (
    <section className="panel">
      <h2>Entitlements</h2>
      <p className="muted">Entitlements are resolved server-side from the customer's active subscription tier or assigned tier.</p>
      {error && <div className="error-box compact">{error}</div>}
      <table>
        <thead>
          <tr><th>Entitlement</th>{data.tiers.map(tier => <th key={tier.code}>{tier.name}</th>)}</tr>
        </thead>
        <tbody>
          {data.entitlementDefinitions.map(def => (
            <tr key={def.key}>
              <td><strong>{def.label}</strong><br /><span className="muted">{def.key}</span></td>
              {data.tiers.map(tier => {
                const grant = grantMap.get(`${tier.code}:${def.key}`);
                const cellKey = `${tier.code}:${def.key}`;
                const value = entitlementValue(def, grant);
                const checked = switchChecked(def, grant);
                return (
                  <td key={tier.code}>
                    <div className="entitlement-cell">
                      <Switcher
                        key={`${cellKey}:${checked}`}
                        checked={checked}
                        disabled={savingKey === cellKey}
                        label={`${tier.name} ${def.label}`}
                        onChange={(nextChecked, input) => saveToggle(tier.code, def, grant, nextChecked, input)}
                      />
                      {def.valueType === 'number' && <span className="entitlement-value">{String(value)}</span>}
                      {def.valueType === 'string' && <span className="entitlement-value">{String(value)}</span>}
                      {savingKey === cellKey && <span className="entitlement-saving">Saving...</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
