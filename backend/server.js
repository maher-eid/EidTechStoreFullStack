const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

// =======================
// Middleware
// =======================
app.use(cors());
app.use(express.json());

// =======================
// Ensure images directory exists
// =======================
const imagesDir = path.join(__dirname, "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log("📁 Created images directory");
}

// =======================
// Static images
// =======================
app.use("/images", express.static(imagesDir));

// =======================
// MySQL connection
// =======================
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "eidtechstoredb",
});

db.connect((err) => {
  if (err) {
    console.log("❌ DB Error:", err);
    console.log("Please make sure MySQL is running and the database 'eidtechstoredb' exists");
  } else {
    console.log("✅ MySQL Connected");
  }
});
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  }
});

// =======================
// Test route
// =======================
app.get("/", (req, res) => {
  res.json({ message: "Backend server is running" });
});

// =======================
// USER REGISTRATION
// =======================
app.post("/user/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required" });
  }

  // Validate input
  if (name.trim().length < 2) {
    return res.status(400).json({ message: "Name must be at least 2 characters" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  // Check if email already exists
  const checkEmail = "SELECT * FROM users WHERE email = ?";
  db.query(checkEmail, [email.trim()], (err, emailData) => {
    if (err) {
      console.error("Registration error (email check):", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (emailData.length > 0) {
      return res.status(400).json({ message: "Email already taken" });
    }

    // Check if name/username already exists
    const checkName = "SELECT * FROM users WHERE name = ?";
    db.query(checkName, [name.trim()], (err, nameData) => {
      if (err) {
        console.error("Registration error (name check):", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (nameData.length > 0) {
        return res.status(400).json({ message: "Username already taken" });
      }

      // Insert new user (default isAdmin = 0 for regular users)
      // Note: Users cannot register as admin - admin accounts must be created manually in database
      const q = "INSERT INTO users (name, email, password, isAdmin) VALUES (?, ?, ?, 0)";
      db.query(q, [name.trim(), email.trim(), password], (err, result) => {
        if (err) {
          console.error("Registration error (insert):", err);
          console.error("SQL Error details:", {
            code: err.code,
            sqlMessage: err.sqlMessage,
            sql: err.sql
          });
          
          // Check for duplicate entry error
          if (err.code === "ER_DUP_ENTRY") {
            const sqlMsg = err.sqlMessage || "";
            if (sqlMsg.includes("email") || sqlMsg.includes("Email")) {
              return res.status(400).json({ message: "Email already taken" });
            } else if (sqlMsg.includes("name") || sqlMsg.includes("Name")) {
              return res.status(400).json({ message: "Username already taken" });
            }
            return res.status(400).json({ message: "This information is already taken" });
          }
          
          // Check for other common database errors
          if (err.code === "ER_NO_SUCH_TABLE") {
            return res.status(500).json({ message: "Database table not found. Please contact administrator." });
          }
          
          return res.status(500).json({ message: "Failed to create account. Please try again." });
        }

        if (!result || !result.insertId) {
          console.error("Registration failed: No insert ID returned");
          return res.status(500).json({ message: "Failed to create account" });
        }

        console.log("New user registered successfully:", {
          id: result.insertId,
          name: name.trim(),
          email: email.trim()
        });

        res.status(201).json({
          message: "Account created successfully",
          user: {
            id: result.insertId,
            name: name.trim(),
            email: email.trim(),
            isAdmin: false,
          },
        });
      });
    });
  });
});

// =======================
// UNIFIED LOGIN (Auto-detects user/admin)
// =======================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const q = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(q, [email, password], (err, data) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (data.length === 0) {
      return res.status(401).json({ message: "Wrong email or password" });
    }

    const isAdmin = data[0].isAdmin === 1;
    
    res.json({
      message: "Login successful",
      user: {
        id: data[0].id,
        name: data[0].name,
        email: data[0].email,
        isAdmin: isAdmin,
        userType: isAdmin ? "admin" : "user",
      },
    });
  });
});

// =======================
// USER LOGIN (Keep for backward compatibility)
// =======================
app.post("/user/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const q = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(q, [email, password], (err, data) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (data.length === 0) {
      return res.status(401).json({ message: "Wrong email or password" });
    }

    // Return user data (both admin and regular users can use this)
    res.json({
      message: "Login successful",
      user: {
        id: data[0].id,
        name: data[0].name,
        email: data[0].email,
        isAdmin: data[0].isAdmin === 1,
      },
    });
  });
});

// =======================
// ADMIN LOGIN
// =======================
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const q = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(q, [email, password], (err, data) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (data.length === 0) {
      return res.status(401).json({ message: "Wrong email or password" });
    }

    if (data[0].isAdmin !== 1) {
      return res.status(403).json({ message: "Not admin" });
    }

    res.json({
      message: "Admin login successful",
      admin: {
        id: data[0].id,
        name: data[0].name,
        email: data[0].email,
      },
    });
  });
});

// =======================
// GET PRODUCTS
// =======================
app.get("/products", (req, res) => {
  const q = "SELECT * FROM products ORDER BY id DESC";
  db.query(q, (err, data) => {
    if (err) {
      console.error("Get products error:", err);
      return res.status(500).json({ message: "Failed to fetch products" });
    }

    const products = data.map((p) => ({
      ...p,
      image: `http://localhost:5000/images/${p.image}`,
    }));

    res.json(products);
  });
});

// =======================
// GET SINGLE PRODUCT
// =======================
app.get("/products/:id", (req, res) => {
  const id = req.params.id;
  const q = "SELECT * FROM products WHERE id = ?";
  
  db.query(q, [id], (err, data) => {
    if (err) {
      console.error("Get product error:", err);
      return res.status(500).json({ message: "Failed to fetch product" });
    }

    if (data.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = {
      ...data[0],
      image: `http://localhost:5000/images/${data[0].image}`,
    };

    res.json(product);
  });
});

// =======================
// ADD PRODUCT (WITH IMAGE)
// =======================
app.post("/products", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;

  if (!name || !price || !description) {
    return res.status(400).json({ message: "Name, price, and description are required" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "Image is required" });
  }

  const image = req.file.filename;

  const q = `
    INSERT INTO products (name, price, image, description, stock, category_id)
    VALUES (?, ?, ?, ?, 0, 1)
  `;

  db.query(q, [name, price, image, description], (err, result) => {
    if (err) {
      console.error("Add product error:", err);
      // Delete uploaded file if database insert fails
      const filePath = path.join(imagesDir, image);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(500).json({ message: "Failed to add product" });
    }
    
    res.status(201).json({ 
      message: "Product added successfully",
      productId: result.insertId 
    });
  });
});

// =======================
// UPDATE PRODUCT
// =======================
app.put("/products/:id", upload.single("image"), (req, res) => {
  const id = req.params.id;
  const { name, price, description } = req.body;

  if (!name || !price || !description) {
    return res.status(400).json({ message: "Name, price, and description are required" });
  }
  if (req.file) {
    // Get old image path first
    const q1 = "SELECT image FROM products WHERE id = ?";
    db.query(q1, [id], (err, data) => {
      if (err) {
        console.error("Update product error:", err);
        return res.status(500).json({ message: "Failed to update product" });
      }

      if (data.length === 0) {
        // Delete the newly uploaded file if product doesn't exist
        const filePath = path.join(imagesDir, req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return res.status(404).json({ message: "Product not found" });
      }

      // Delete old image
      const oldImage = data[0].image;
      if (oldImage) {
        const oldImagePath = path.join(imagesDir, oldImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      // Update with new image
      const newImage = req.file.filename;
      const q = "UPDATE products SET name = ?, price = ?, description = ?, image = ? WHERE id = ?";
      db.query(q, [name, price, description, newImage, id], (err) => {
        if (err) {
          console.error("Update product error:", err);
          // Delete new image if update fails
          const filePath = path.join(imagesDir, newImage);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          return res.status(500).json({ message: "Failed to update product" });
        }
        res.json({ message: "Product updated successfully" });
      });
    });
  } else {
    // Update without changing image
    const q = "UPDATE products SET name = ?, price = ?, description = ? WHERE id = ?";
    db.query(q, [name, price, description, id], (err) => {
      if (err) {
        console.error("Update product error:", err);
        return res.status(500).json({ message: "Failed to update product" });
      }
      
      // Check if product was actually updated
      db.query("SELECT * FROM products WHERE id = ?", [id], (err, data) => {
        if (err || data.length === 0) {
          return res.status(404).json({ message: "Product not found" });
        }
        res.json({ message: "Product updated successfully" });
      });
    });
  }
});

// =======================
// DELETE PRODUCT + IMAGE
// =======================
app.delete("/products/:id", (req, res) => {
  const id = req.params.id;

  // First, get the image filename
  const q1 = "SELECT image FROM products WHERE id = ?";
  db.query(q1, [id], (err, data) => {
    if (err) {
      console.error("Delete product error:", err);
      return res.status(500).json({ message: "Failed to delete product" });
    }

    if (data.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete the image file
    const image = data[0].image;
    if (image) {
      const imgPath = path.join(imagesDir, image);
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    }

    // Delete the product from database
    const q2 = "DELETE FROM products WHERE id = ?";
    db.query(q2, [id], (err) => {
      if (err) {
        console.error("Delete product error:", err);
        return res.status(500).json({ message: "Failed to delete product" });
      }
      res.json({ message: "Product deleted successfully" });
    });
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File too large. Maximum size is 5MB" });
    }
    return res.status(400).json({ message: err.message });
  }
  
  if (err) {
    console.error("Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
  
  next();
});
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// =======================
// Start server
// =======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Images directory: ${imagesDir}`);
  console.log(`🌐 API available at http://localhost:${PORT}`);
});

// =======================
// Graceful shutdown
// =======================
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  db.end((err) => {
    if (err) {
      console.error("Error closing database connection:", err);
    } else {
      console.log("Database connection closed");
    }
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT signal received: closing HTTP server");
  db.end((err) => {
    if (err) {
      console.error("Error closing database connection:", err);
    } else {
      console.log("Database connection closed");
    }
    process.exit(0);
  });
});

