const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.json())

// route kamu yang ada
app.get('/', (req, res) => res.send('Backend ESDM OK - HIDE ACUAN'))
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// contoh route data sheet kamu
// app.use('/api/data', require('./routes/data'))

module.exports = app