import cors from 'cors'
import express from 'express'
import getData from './data/index.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/data', async (req,res)=>{
  try{
    const gid = req.query.gid || '285923348'
    const data = await getData(gid)
    console.log('API OUT:', data.length)
    res.json({data})
  }catch(e){
    console.error('API ERROR:', e.message)
    res.status(500).json({error:e.message, data:[]})
  }
})

app.get('/', (req,res)=> res.json({ok:true}))

export default app