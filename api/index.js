const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())

app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend ESDM jalan - HIDE ACUAN',
    time: new Date().toISOString()
  })
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

// Ini yang nanti kita isi filter ICON PGA
app.get('/api/data', (req, res) => {
  res.json({ filter: 'icon_Detail != null && DTP_Detail != null', data: [] })
})

module.exports = app