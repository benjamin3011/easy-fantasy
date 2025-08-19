// src/pages/Admin/RolesTools.tsx
import { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import Label from '../../components/form/Label';
import Input from '../../components/form/input/InputField';
import Button from '../../components/ui/button/Button';
import Alert from '../../components/ui/alert/Alert';
import { addAdminRoleCallable } from '../../firebase/callables';

export default function RolesTools() {
  const [uid, setUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makeAdmin = async () => {
    setMessage(null); setError(null); setLoading(true);
    try {
      const res = await addAdminRoleCallable({ uid: uid.trim() });
      setMessage(res.data.message || 'Admin role assigned.');
      if (!res.data.success) setError(res.data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add admin role.');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      {message && (<Alert variant="success" title="Success" message={message} showLink={false} />)}
      {error && (<Alert variant="error" title="Error" message={error} showLink={false} />)}

      <ComponentCard title='Assign Admin Role'>
        <div className="space-y-2">
          <Label htmlFor="uidInput">User ID to make Admin</Label>
          <Input id="uidInput" type="text" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Enter User UID" disabled={loading} className="w-full" />
        </div>
        <Button onClick={makeAdmin} disabled={loading || !uid.trim()} className="mt-3">
          {loading ? 'Assigning…' : 'Make Admin'}
        </Button>
      </ComponentCard>
    </div>
  );
}


