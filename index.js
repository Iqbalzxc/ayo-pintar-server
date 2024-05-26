const express = require("express");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET);
const jwt = require("jsonwebtoken");
const cors = require("cors");
const port = process.env.PORT || 3000;

// middlewares
app.use(cors());
app.use(express.json());

// verify token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "Invalid authorization" });
  }

  const token = authorization?.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

// koneksi mongodb
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@ayo-pintar.b0vpngj.mongodb.net/?retryWrites=true&w=majority&appName=ayo-pintar`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // buat sebuah koneksi database dan koleksi
    const database = client.db("ayo-pintar");
    const usersCollection = database.collection("users");
    const classesCollection = database.collection("classes");
    const cartCollection = database.collection("cart");
    const paymentCollection = database.collection("payments");
    const enrolledCollection = database.collection("enrolled");
    const appliedCollection = database.collection("applied");

    // disini route users
    app.post("/api/set-token", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    // middleware untuk admin dan tutor
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user.role === "admin") {
        next();
      } else {
        return res.status(401).send({ message: "Unauthorized access" });
      }
    };

    const verifyTutor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user.role === "tutor") {
        next();
      } else {
        return res.status(401).send({ message: "Unauthorized access" });
      }
    };

    app.post("/new-user", async (req, res) => {
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const user = await usersCollection.findOne(query);
      res.send(user);
    });

    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.delete("/delete-user/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/update-user/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedUser = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          address: updatedUser.address,
          about: updatedUser.about,
          photoUrl: updatedUser.photoUrl,
          title: updatedUser.title,
          university: updatedUser.university,
          skills: updatedUser.skills ? updatedUser.skills : null,
        },
      };

      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    /* Disini route classes */
    app.post("/new-class", verifyJWT, verifyTutor, async (req, res) => {
      const newClass = req.body;
      // newClass.availableSeats = parseInt(newClass.availableSeats);
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get("/classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    // Mendapatkan classes dari email
    app.get("/classes/:email", verifyJWT, verifyTutor, async (req, res) => {
      const email = req.params.email;
      const query = { tutorEmail: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // Memanage classes
    app.get("/classes-manage", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    // Update classes dan reason
    app.patch(
      "/change-status/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const status = req.body.status;
        const reason = req.body.reason;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: status,
            reason: reason,
          },
        };
        const result = await classesCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    // mendapatkan class yang distujui
    app.get("/approved-classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // mendapatkan detail satu class
    app.get("/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(query);
      res.send(result);
    });

    // memperbaharui detail class (semua data)
    app.put("/update-class/:id", verifyJWT, verifyTutor, async (req, res) => {
      const id = req.params.id;
      const updateClass = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: updateClass.name,
          description: updateClass.description,
          price: updateClass.price,
          availableSeats: parseInt(updateClass.availableSeats),
          groupWaLink: updateClass.groupWaLink,
          status: "pending",
        },
      };
      const result = await classesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    /* Disini route cart */
    app.post("/add-to-cart", verifyJWT, async (req, res) => {
      const newCartItem = req.body;
      const result = await cartCollection.insertOne(newCartItem);
      res.send(result);
    });

    // Mendapatkan item cart dengan Id
    app.get("/cart-item/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;
      const query = {
        classId: id,
        userMail: email,
      };
      const projection = { classId: 1 };
      const result = await cartCollection.findOne(query, {
        projection: projection,
      });
      res.send(result);
    });

    // mendapatkan info cart by user email
    app.get("/cart/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { userMail: email };
      const projection = { classId: 1 };
      const carts = await cartCollection
        .find(query, { projection: projection })
        .toArray();
      const classIds = carts.map((cart) => new ObjectId(cart.classId));
      const query2 = { _id: { $in: classIds } };
      const result = await classesCollection.find(query2).toArray();
      res.send(result);
    }); // CHECK ERROR!

    // menghapus item cart
    app.delete("/delete-cart-item/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { classId: id };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    /* Disini route payment */
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price) * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // membuat payment ke db
    app.post("/payment-info", verifyJWT, async (req, res) => {
      const paymentInfo = req.body;
      const classesId = paymentInfo.classesId;
      const userEmail = paymentInfo.userEmail;
      const singleClassId = req.query.classId;
      let query;
      if (singleClassId) {
        query = { classId: singleClassId, userMail: userEmail };
      } else {
        query = { classId: { $in: classesId } };
      }

      const classesQuery = {
        _id: { $in: classesId.map((id) => new ObjectId(id)) },
      };
      const classes = await classesCollection.find(classesQuery).toArray();
      const newEnrolledData = {
        userMail: userEmail,
        classesId: classesId.map((id) => new ObjectId(id)),
        transactionId: paymentInfo.transactionId,
      };

      const updateDoc = {
        $set: {
          totalEnrolled:
            classes.reduce(
              (total, current) => total + current.totalEnrolled,
              0
            ) + 1 || 0,
          availableSeats:
            classes.reduce(
              (total, current) => total + current.availableSeats,
              0
            ) - 1 || 0,
        },
      };

      const updatedResult = await classesCollection.updateMany(
        classesQuery,
        updateDoc,
        { upsert: true }
      );
      const enrolledResult = await enrolledCollection.insertOne(
        newEnrolledData
      );
      const deleteResult = await cartCollection.deleteMany(query);
      const paymentResult = await paymentCollection.insertOne(paymentInfo);

      res.send({ paymentResult, deleteResult, enrolledResult, updatedResult });
    });

    // Mendapatkan history pembayaran
    app.get("/payment-history/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await paymentCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // panjang history pembayaran
    app.get("/payment-history-length/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const total = await paymentCollection.countDocuments(query);
      res.send({ total });
    });

    // Disini route enrollment
    app.get("/popular-classes", async (req, res) => {
      const result = await classesCollection
        .find()
        .sort({ totalEnrolled: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // popular tutor
    app.get("/popular-tutors", async (req, res) => {
      const pipeline = [
        {
          $group: {
            _id: "$tutorEmail",
            totalEnrolled: { $sum: "$totalEnrolled" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "email",
            as: "tutor",
          },
        },
        {
          $match: {
            "tutor.role": "tutor",
          },
        },
        {
          $project: {
            _id: 0,
            tutor: {
              $arrayElemAt: ["$tutor", 0],
            },
            totalEnrolled: 1,
          },
        },
        {
          $sort: {
            totalEnrolled: -1,
          },
        },
        {
          $limit: 6,
        },
      ];

      const result = await classesCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // admin status
    app.get("/admin-stats", verifyJWT, verifyAdmin, async (req, res) => {
      const approvedClasses = (
        await classesCollection.find({ status: "approved" })
      ).toArray().length;
      const pendingClasses = (
        await classesCollection.find({ status: "pending" })
      ).toArray().length;
      const tutors = (await usersCollection.find({ role: "tutor" })).toArray()
        .length;
      const totalClasses = (await classesCollection.find().toArray()).length;
      const totalEnrolled = (await enrolledCollection.find().toArray()).length;

      const result = {
        approvedClasses,
        pendingClasses,
        tutors,
        totalClasses,
        totalEnrolled,
      };

      res.send(result);
    });

    // mendapatkan semua tutor
    app.get("/tutors", async (req, res) => {
      const result = await usersCollection.find({ role: "tutor" }).toArray();
      res.send(result);
    });

    // enrolled classes by email
    app.get("/enrolled-classes/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email }; // Before userMail
      const pipeline = [
        {
          $match: query,
        },
        {
          $lookup: {
            from: "classes",
            localField: "classesId",
            foreignField: "_id",
            as: "classes",
          },
        },
        {
          $unwind: "$classes",
        },
        {
          $lookup: {
            from: "users",
            localField: "classes.tutorEmail",
            foreignField: "email",
            as: "tutor",
          },
        },
        {
          $project: {
            _id: 0,
            tutor: {
              $arrayElemAt: ["$tutor", 0],
            },
            classes: 1,
          },
        },
      ];

      const result = await enrolledCollection.aggregate(pipeline).toArray();
      res.send(result);
    });

    // apply untuk tutor
    app.post("/ass-tutor", async (req, res) => {
      const data = req.body;
      const result = await appliedCollection.insertOne(data);
      res.send(result);
    });

    app.get("/applied-tutors/:email", async (req, res) => {
      const email = req.params.email;
      const result = await appliedCollection.findOne({ email });
      res.send(result);
    });

    //

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Bimbel & Privat Ayo Pintar Cirebon!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
