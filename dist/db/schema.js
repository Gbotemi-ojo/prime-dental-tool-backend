"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blogRelations = exports.emailSubscriptionRelations = exports.productRelations = exports.categoryRelations = exports.emailSubscriptions = exports.blogs = exports.products = exports.categories = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.categories = (0, mysql_core_1.mysqlTable)("categories", {
    id: (0, mysql_core_1.serial)("id").primaryKey(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
});
exports.products = (0, mysql_core_1.mysqlTable)("products", {
    id: (0, mysql_core_1.serial)("id").primaryKey(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    price: (0, mysql_core_1.decimal)("price", { precision: 10, scale: 2 }).notNull(),
    picture: (0, mysql_core_1.text)("picture"),
    description: (0, mysql_core_1.text)("description"),
    categoryId: (0, mysql_core_1.int)("category_id")
        .notNull(),
});
exports.blogs = (0, mysql_core_1.mysqlTable)("blogs", {
    id: (0, mysql_core_1.serial)("id").primaryKey(),
    title: (0, mysql_core_1.varchar)("title", { length: 255 }).notNull(),
    thumbnail: (0, mysql_core_1.text)("thumbnail"),
    content: (0, mysql_core_1.text)("content").notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow(),
});
exports.emailSubscriptions = (0, mysql_core_1.mysqlTable)("email_subscriptions", {
    id: (0, mysql_core_1.serial)("id").primaryKey(),
    email: (0, mysql_core_1.varchar)("email", { length: 255 }).notNull().unique(),
    subscribedAt: (0, mysql_core_1.timestamp)("subscribed_at").defaultNow(),
});
exports.categoryRelations = (0, drizzle_orm_1.relations)(exports.categories, ({ many }) => ({
    products: many(exports.products),
}));
exports.productRelations = (0, drizzle_orm_1.relations)(exports.products, ({ one }) => ({
    category: one(exports.categories, {
        fields: [exports.products.categoryId],
        references: [exports.categories.id],
    }),
}));
exports.emailSubscriptionRelations = (0, drizzle_orm_1.relations)(exports.emailSubscriptions, () => ({}));
exports.blogRelations = (0, drizzle_orm_1.relations)(exports.blogs, () => ({}));
