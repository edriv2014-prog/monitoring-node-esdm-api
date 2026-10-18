import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function ManajemenPengguna() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'operator', nama_lengkap: '' });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(editId){
      await supabase.from('users').update(form).eq('id', editId);
      setEditId(null);
    } else {
      await supabase.from('users').insert([form]);
    }
    setForm({ username: '', password: '', role: 'operator', nama_lengkap: '' });
    fetchUsers();
  };

  const handleEdit = (user) => {
    setForm({ username: user.username, password: user.password, role: user.role, nama_lengkap: user.nama_lengkap });
    setEditId(user.id);
  };

  const handleDelete = async (id) => {
    if(!confirm('Hapus pengguna ini?')) return;
    await supabase.from('users').delete().eq('id', id);
    fetchUsers();
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow">
      <h2 className="text-2xl font-bold mb-4">CRUD Pengguna ESDM</h2>

      {/* Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 mb-6 bg-gray-50 p-4 rounded-lg">
        <input className="border p-2 rounded" placeholder="Username" value={form.username} onChange={e=>setForm({...form, username:e.target.value})} required />
        <input className="border p-2 rounded" placeholder="Password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} required />
        <input className="border p-2 rounded" placeholder="Nama Lengkap" value={form.nama_lengkap} onChange={e=>setForm({...form, nama_lengkap:e.target.value})} required />
        <select className="border p-2 rounded" value={form.role} onChange={e=>setForm({...form, role:e.target.value})}>
          <option value="operator">Operator</option>
          <option value="dirjen">Dirjen</option>
          <option value="admin">Admin</option>
          <option value="menteri">Menteri</option>
        </select>
        <button type="submit" className="col-span-4 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          {editId? 'Update Pengguna' : '+ Tambah Pengguna'}
        </button>
      </form>

      {/* Tabel */}
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Username</th>
            <th className="border p-2">Nama</th>
            <th className="border p-2">Role</th>
            <th className="border p-2">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {loading? <tr><td colSpan={4} className="text-center p-4">Loading...</td></tr> :
            users.map(u=>(
              <tr key={u.id}>
                <td className="border p-2">{u.username}</td>
                <td className="border p-2">{u.nama_lengkap}</td>
                <td className="border p-2"><span className="bg-blue-100 px-2 py-1 rounded text-xs">{u.role}</span></td>
                <td className="border p-2 space-x-2">
                  <button onClick={()=>handleEdit(u)} className="bg-yellow-500 text-white px-3 py-1 rounded">Edit</button>
                  <button onClick={()=>handleDelete(u.id)} className="bg-red-600 text-white px-3 py-1 rounded">Hapus</button>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}