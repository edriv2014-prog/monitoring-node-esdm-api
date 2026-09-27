
import express from 'express'
import cors from 'cors'
import dataRoute from './routes/data.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req,res)=> res.json({status:'ok', message:'ESDM Backend - SORT DESC by Tanggal'}))
app.use('/api/data', dataRoute)

const PORT = process.env.PORT || 3001
app.listen(PORT, ()=> console.log(`Backend jalan di http://localhost:${PORT}`))
