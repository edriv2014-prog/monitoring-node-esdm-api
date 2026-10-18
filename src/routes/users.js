const express = require('express');
const router = express.Router();
const { supabase } = require('../supabaseClient');

// GET semua pengguna
router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if(error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST tambah pengguna
router.post('/', async (req, res) => {
  const { username, password, role, nama_lengkap } = req.body;
  const { data, error } = await supabase.from('users').insert([{ username, password, role, nama_lengkap }]).select();
  if(error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// PUT edit pengguna
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, role, nama_lengkap } = req.body;
  const { data, error } = await supabase.from('users').update({ username, password, role, nama_lengkap }).eq('id', id).select();
  if(error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// DELETE hapus pengguna
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('users').delete().eq('id', id);
  if(error) return res.status(500).json({ error: error.message });
  res.json({ message: 'User terhapus' });
});

module.exports = router;