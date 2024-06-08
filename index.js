const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const port = process.env.PORT || 5000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())

// Verify Token Middleware
const verifyToken = (req, res, next) => {
  console.log('inside verify token', req.headers.authorization);
  if (!req.headers.authorization) {
      return res.status(401).send({ message: 'forbidden access' })
  }
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
          return res.status(401).send({ message: 'forbidden access' })
      }
      req.decoded = decoded;
      next();
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5rmxtse.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const scholarshipsCollection = client.db('battleDB').collection('scholarships')
    // const usersCollection = client.db('battleDB').collection('users')
    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      console.log(user)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })

    // create-payment-intent
    app.post('/create-payment-intent', async (req, res) => {
      const price = req.body.price
      const priceInCent = parseFloat(price) * 100
      if (!price || priceInCent < 1) return
      // generate clientSecret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: 'usd',
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      })
      // send client secret as response
      res.send({ clientSecret: client_secret })
    })

    // get a user info by email from db
    //  app.get('/user/:email', async (req, res) => {
    //   const email = req.params.email
    //   const result = await usersCollection.findOne({ email })
    //   res.send(result)
    // })

    app.get('/scholarships', async (req, res) => {
      const result = await scholarshipsCollection.find().toArray()
      res.send(result)
    })

    app.get('/scholarship/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipsCollection.findOne(query)
      res.send(result)
    })

    // Get all scholarship data from db for pagination
    app.get('/scholarship', async (req, res) => {
      const size = parseInt(req.query.size) || 8
      const page = parseInt(req.query.page) - 1
      const search = req.query.search || ''
      console.log(size, page)

      let query = {
        name: { $regex: search, $options: 'i' },
      }
      let options = {}
      const result = await scholarshipsCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray()

      res.send(result)
    })

    // Get all jobs data count from db
    app.get('/jobs-count', async (req, res) => {
      const search = req.query.search
      let query = {
        name: { $regex: search, $options: 'i' },
      }
      const count = await scholarshipsCollection.countDocuments(query)

      res.send({ count })
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('My Battle server is running')
})

app.listen(port, () => {
  console.log(`My server is running on port: ${port}`)
})