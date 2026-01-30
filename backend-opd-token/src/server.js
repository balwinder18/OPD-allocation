const express = require('express');
const dotenv = require('dotenv');
const router = require('./routes/route');
dotenv.config();


const app = express();


app.use(express.json());


app.get('/', (req, res) => res.send('OPD System is Online'));
app.use('/api' , router)

const PORT = process.env.PORT || 3000;

app.listen(PORT  , ()=>{
   console.log(`Server is running on port ${PORT}`);
})