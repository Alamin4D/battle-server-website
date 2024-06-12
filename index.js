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
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://6669d89c3bf1500422f2b447--scintillating-rabanadas-b8327e.netlify.app'],
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
      return res.status(401).send({ message: 'forbidden access2' })
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
    const usersCollection = client.db('battleDB').collection('users')
    const appliedCollection = client.db('battleDB').collection('applied')
    const reviewsCollection = client.db('battleDB').collection('reviews')

     // verify admin middleware
     const verifyAdmin = async (req, res, next) => {
      console.log('hello')
      const user = req.decoded
      const query = { email: user?.email }
      console.log(query)
      const result = await usersCollection.findOne(query)
      console.log(result?.role)
      if (!result || result?.role !== 'admin')
        return res.status(401).send({ message: 'unauthorized access!!' })

      next()
    }
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

    // save a user data in db
    app.put('/user', async (req, res) => {
      const user = req.body
      const query = { email: user?.email }
      // check if user already exists in db
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        if (user.status === 'Requested') {
          // if existing user try to change his role
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          })
          return res.send(result)
        } else {
          // if existing user login again
          return res.send(isExist)
        }
      }

      // save user for the first time
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...user,
        },
      }
      const result = await usersCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })

    // get a user info by email from db
    app.get('/user/:email', async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email })
      res.send(result)
    })

    // users related api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
  })

  //update a user role
  app.patch('/users/update/:email', async (req, res) => {
    const email = req.params.email
    const user = req.body
    const query = { email }
    const updateDoc = {
      $set: { ...user, timestamp: Date.now() },
    }
    const result = await usersCollection.updateOne(query, updateDoc)
    res.send(result)
  })


  app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
  })

    app.get('/scholarships', async (req, res) => {
      const result = await scholarshipsCollection.find().toArray()
      res.send(result)
    })

    // Save a scholarship data in db
    app.post('/add-scholarship', async (req, res) => {
      const scholarshipData = req.body
      const result = await scholarshipsCollection.insertOne(scholarshipData)
      res.send(result)
    })

    // update scholarship data
    app.put('/scholarship/update/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const scholarshipData = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: scholarshipData,
      }
      const result = await scholarshipsCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    // get all applier for moderator
    app.get('/all-applied/:email', async (req, res) => {
      const email = req.params.email

      let query = { 'userData.email': email }
      console.log(query)
      const result = await appliedCollection.find(query).toArray()
      res.send(result)
    })

    // delete a apply scholarship
    app.delete('/all-applied/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipsCollection.deleteOne(query)
      res.send(result)
    })

    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray()
      res.send(result)
    })

    // get all applier for moderator
    app.get('/all-review/:email', async (req, res) => {
      const email = req.params.email

      let query = { 'userData.email': email }
      const result = await reviewsCollection.find(query).toArray()
      res.send(result)
    })

    // update scholarship data
    app.put('/review/update/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const reviewData = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: reviewData,
      }
      const result = await reviewsCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    // delete a review
    app.delete('/all-review/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await reviewsCollection.deleteOne(query)
      res.send(result)
    })

    app.get('/scholarship/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipsCollection.findOne(query)
      res.send(result)
    })

    app.get('/applied', async (req, res) => {
      const result = await appliedCollection.find().toArray()
      res.send(result)
    })

     // Save a booking data in db
     app.post('/applied-scholarship', verifyToken, async (req, res) => {
      const appliedData = req.body
      const result = await appliedCollection.insertOne(appliedData)
      res.send(result)
    })

     // Save a review data in db
     app.post('/add-review', verifyToken, async (req, res) => {
      const reviewData = req.body
      const result = await reviewsCollection.insertOne(reviewData)
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