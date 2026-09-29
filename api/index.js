import app from '../src/app.js'
export default app
// atau kalau kamu pakai getData langsung:
// import getData from '../src/data/index.js'
// export default async (req,res)=>{ const data=await getData(req.query.gid); res.json({data}) }