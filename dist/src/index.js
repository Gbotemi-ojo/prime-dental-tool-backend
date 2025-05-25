"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const promise_1 = __importDefault(require("mysql2/promise"));
const mysql2_1 = require("drizzle-orm/mysql2");
const drizzle_orm_1 = require("drizzle-orm");
const multer_1 = __importDefault(require("multer"));
const cloudinary_1 = require("cloudinary");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const schema_1 = require("../db/schema");
const schema = __importStar(require("../db/schema"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const dbCredentials = {
    host: 'panel909.harmondns.net',
    port: 3306,
    database: 'novacres_storage',
    user: 'novacres_oluwagbotemi',
    password: 'Takeoff0Takeoff0',
};
const pool = promise_1.default.createPool({
    host: dbCredentials.host,
    port: dbCredentials.port,
    database: dbCredentials.database,
    user: dbCredentials.user,
    password: dbCredentials.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
async function testDatabaseConnection() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Database connection successful!');
    }
    catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
    finally {
        if (connection) {
            connection.release();
        }
    }
}
testDatabaseConnection();
const db = (0, mysql2_1.drizzle)(pool, { schema, mode: 'default' });
process.on('SIGINT', async () => {
    console.log('Closing MySQL connection pool...');
    await pool.end();
    console.log('MySQL connection pool closed.');
    process.exit(0);
});
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dvsy8zqhe',
    api_key: process.env.CLOUDINARY_API_KEY || '938245549435185',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'u4FX3a69r-ZKWnrGg-DQd2skHVU',
});
const uploadsDir = path_1.default.join(__dirname, '..', 'uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    },
});
const upload = (0, multer_1.default)({ storage });
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.sendStatus(401);
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.sendStatus(403);
        req.user = user;
        next();
    });
}
app.post('/auth/signin', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'superpassword001') {
        const token = jsonwebtoken_1.default.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token });
    }
    else {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
});
app.post('/auth/signout', (req, res) => {
    return res.json({ message: 'Signed out successfully' });
});
app.get('/products/:id', authenticateToken, async (req, res) => {
    const productId = req.params.id;
    try {
        const product = await db.select().from(schema_1.products).where((0, drizzle_orm_1.eq)(schema_1.products.id, parseInt(productId))).limit(1);
        if (!product.length) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching product' });
    }
});
app.get('/products', authenticateToken, async (req, res) => {
    try {
        const productsWithCategory = await db
            .select({
            id: schema_1.products.id,
            name: schema_1.products.name,
            price: schema_1.products.price,
            picture: schema_1.products.picture,
            description: schema_1.products.description,
            categoryId: schema_1.products.categoryId,
            categoryName: schema_1.categories.name,
        })
            .from(schema_1.products)
            .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.products.categoryId, schema_1.categories.id));
        res.json(productsWithCategory);
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching products' });
    }
});
app.post('/products', authenticateToken, upload.single('picture'), async (req, res) => {
    const { name, price, description, categoryId, imageUrl } = req.body;
    let pictureUrl;
    try {
        if (req.file) {
            const result = await cloudinary_1.v2.uploader.upload(req.file.path);
            pictureUrl = result.secure_url;
            fs_1.default.unlinkSync(req.file.path);
        }
        else if (imageUrl && imageUrl.trim() !== '') {
            pictureUrl = imageUrl.trim();
        }
        const [newProduct] = await db.insert(schema_1.products).values({
            name,
            price: parseFloat(price).toString(),
            description,
            categoryId: parseInt(categoryId),
            picture: pictureUrl || '',
        });
        const insertedProduct = await db.select().from(schema_1.products).orderBy((0, drizzle_orm_1.eq)(schema_1.products.id, newProduct.insertId)).limit(1);
        res.json(insertedProduct[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Error creating product' });
    }
});
app.put('/products/:id', authenticateToken, upload.single('picture'), async (req, res) => {
    const productId = req.params.id;
    const { name, price, description, categoryId } = req.body;
    let pictureUrl;
    try {
        if (req.file) {
            const result = await cloudinary_1.v2.uploader.upload(req.file.path);
            pictureUrl = result.secure_url;
            fs_1.default.unlinkSync(req.file.path);
        }
        await db.update(schema_1.products)
            .set({
            name,
            price: parseFloat(price).toString(),
            description,
            categoryId: parseInt(categoryId),
            ...(pictureUrl ? { picture: pictureUrl } : {}),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.products.id, parseInt(productId)));
        res.json({ message: 'Product updated' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error updating product' });
    }
});
app.delete('/products/:id', authenticateToken, async (req, res) => {
    const productId = req.params.id;
    try {
        await db.delete(schema_1.products)
            .where((0, drizzle_orm_1.eq)(schema_1.products.id, parseInt(productId)));
        res.json({ message: 'Product deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error deleting product' });
    }
});
app.get('/categories/:id', async (req, res) => {
    const categoryId = req.params.id;
    try {
        const category = await db.select().from(schema_1.categories).where((0, drizzle_orm_1.eq)(schema_1.categories.id, parseInt(categoryId))).limit(1);
        if (!category.length) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching category' });
    }
});
app.get('/categories', async (req, res) => {
    try {
        const allCategories = await db.select().from(schema_1.categories);
        res.json(allCategories);
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching categories' });
    }
});
app.post('/categories', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Category name is required' });
    try {
        const [newCategory] = await db.insert(schema_1.categories).values({ name });
        const insertedCategory = await db.select().from(schema_1.categories).orderBy((0, drizzle_orm_1.eq)(schema_1.categories.id, newCategory.insertId)).limit(1);
        res.json(insertedCategory[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Error creating category' });
    }
});
app.put('/categories/:id', authenticateToken, async (req, res) => {
    const categoryId = req.params.id;
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Category name is required' });
    try {
        await db.update(schema_1.categories)
            .set({ name })
            .where((0, drizzle_orm_1.eq)(schema_1.categories.id, parseInt(categoryId)));
        res.json({ message: 'Category updated' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error updating category' });
    }
});
app.delete('/categories/:id', authenticateToken, async (req, res) => {
    const categoryId = parseInt(req.params.id);
    if (isNaN(categoryId)) {
        return res.status(400).json({ error: 'Invalid category ID' });
    }
    try {
        await db.delete(schema_1.categories).where((0, drizzle_orm_1.eq)(schema_1.categories.id, categoryId));
        res.json({ message: 'Category deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error deleting category' });
    }
});
app.get('/blogs/:id', async (req, res) => {
    const blogId = req.params.id;
    console.log("Received blog ID:", blogId);
    try {
        const blog = await db.select().from(schema_1.blogs).where((0, drizzle_orm_1.eq)(schema_1.blogs.id, parseInt(blogId)));
        res.json(blog);
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching blog' });
    }
});
app.get('/blogs', async (req, res) => {
    try {
        const allBlogs = await db.select().from(schema_1.blogs);
        res.json(allBlogs);
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching blogs' });
    }
});
app.post('/blogs', authenticateToken, upload.single('thumbnail'), async (req, res) => {
    const { title, content } = req.body;
    let thumbnailUrl;
    try {
        if (req.file) {
            const result = await cloudinary_1.v2.uploader.upload(req.file.path);
            thumbnailUrl = result.secure_url;
            fs_1.default.unlinkSync(req.file.path);
        }
        const [newBlog] = await db.insert(schema_1.blogs).values({
            title,
            content,
            thumbnail: thumbnailUrl || '',
        });
        const insertedBlog = await db.select().from(schema_1.blogs).orderBy((0, drizzle_orm_1.eq)(schema_1.blogs.id, newBlog.insertId)).limit(1);
        res.json(insertedBlog[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Error creating blog' });
    }
});
app.put('/blogs/:id', authenticateToken, upload.single('thumbnail'), async (req, res) => {
    const blogId = req.params.id;
    const { title, content } = req.body;
    let thumbnailUrl;
    try {
        if (req.file) {
            const result = await cloudinary_1.v2.uploader.upload(req.file.path);
            thumbnailUrl = result.secure_url;
            fs_1.default.unlinkSync(req.file.path);
        }
        await db.update(schema_1.blogs)
            .set({
            title,
            content,
            ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.blogs.id, parseInt(blogId)));
        res.json({ message: 'Blog updated' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error updating blog' });
    }
});
app.delete('/blogs/:id', authenticateToken, async (req, res) => {
    const blogId = req.params.id;
    try {
        await db.delete(schema_1.blogs)
            .where((0, drizzle_orm_1.eq)(schema_1.blogs.id, parseInt(blogId)));
        res.json({ message: 'Blog deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error deleting blog' });
    }
});
app.get('/subscriptions', async (req, res) => {
    try {
        const emails = await db.select().from(schema_1.emailSubscriptions);
        res.json(emails);
    }
    catch (error) {
        console.error('Error fetching email subscriptions:', error);
        res.status(500).json({ error: 'Error fetching email subscriptions' });
    }
});
app.post('/subscriptions', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email address is required.' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address format.' });
    }
    try {
        const [newSubscription] = await db.insert(schema_1.emailSubscriptions).values({
            email: email,
        });
        const insertedSubscription = await db.select().from(schema_1.emailSubscriptions).orderBy((0, drizzle_orm_1.eq)(schema_1.emailSubscriptions.id, newSubscription.insertId)).limit(1);
        res.status(201).json(insertedSubscription[0]);
    }
    catch (error) {
        console.error('Error creating email subscription:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'This email is already subscribed.' });
        }
        res.status(500).json({ error: 'Error creating email subscription.' });
    }
});
app.get("test", (req, res) => {
    res.json({ message: "Hello from the test endpoint!" });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
