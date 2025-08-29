// db/seedBilling.ts
import 'dotenv/config'; // Load environment variables
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './db/schema'; // Adjust path if your schema file is elsewhere

// --- Data for Seeding ---

// Simplified HMO list with only the name property
const hmoData = [
    { name: "IHMS" }, { name: "HEALTH PARTNERS" }, { name: "ZENOR" },
    { name: "PHILIPS" }, { name: "PRO HEALTH" }, { name: "FOUNTAIN HEALTH" },
    { name: "DOT HMO" }, { name: "CLEARLINE" }, { name: "STERLING HEALTH" },
    { name: "OCEANIC" }, { name: "SUNU" }, { name: "LIFEWORTH" },
    { name: "CKLINE" }, { name: "WELLNESS" }, { name: "RELIANCE" },
    { name: "FIRST GUARANTEE" }, { name: "THT" }, { name: "DOHEEC" },
    { name: "GNI" }, { name: "MH" }, { name: "AIICO MULTISHIELD" },
    { name: "GREENBAY" }, { name: "MARINA" }, { name: "EAGLE" },
    { name: "MEDIPLAN" }, { name: "METROHEALTH" }, { name: "RONSBERGER" },
    { name: "WELPRO" }, { name: "GORAH" }, { name: "SMATHEALTH" },
    { name: "AXA MANSARD" }, { name: "BASTION" }, { name: "REDCARE" },
    { name: "AVON" }, { name: "ANCHOR" }, { name: "LEADWAY" },
    { name: "NOOR" }, { name: "ALLENZA" }, { name: "UNITED HEALTH CARE" },
    { name: "QUEST" }, { name: "HYGEIA" }, { name: "NEM" }, { name: "KENNEDIA" }
];

// Service pricelist
const serviceData = [
    { name: "Registration & Consultation", price: "5000" },
    { name: "Registration & Consultation (family)", price: "10000" },
    { name: "Scaling and Polishing", price: "40000" },
    { name: "Scaling and Polishing with Gross Stain", price: "50000" },
    { name: "Simple Extraction Anterior", price: "40000" },
    { name: "Simple Extraction Posterior", price: "50000" },
    { name: "Extraction of Retained Root", price: "50000" },
    { name: "Surgical Extraction (Impacted 3rd Molar)", price: "100000" },
    { name: "Temporary Dressing", price: "20000" },
    { name: "Amalgam Filling", price: "30000" },
    { name: "FUJI 9(POSTERIOR GIC (PER FILLING)", price: "50000" },
    { name: "Tooth Whitening (3 Sessions)", price: "100000" },
    { name: "Curretage/Subgingival (per tooth)", price: "30000" },
    { name: "Composite Buildup", price: "50000" },
    { name: "Removable Denture (Additional Tooth)", price: "50000" },
    { name: "PFM Crown", price: "150000" },
    { name: "Topical Flouridation/Desensitization", price: "20000" },
    { name: "X-Ray", price: "10000" },
    { name: "Root Canal Treatment Anterior", price: "100000" },
    { name: "Root Canal Treatment Posterior", price: "150000" },
    { name: "Gingivectomy/Operculectomy", price: "30000" },
    { name: "Splinting with Wires", price: "100000" },
    { name: "Splinting with GIC Composite", price: "150000" },
    { name: "Incision & Drainage/Suturing with Debridement", price: "50000" },
    { name: "Fissure Sealant", price: "20000" },
    { name: "Pulpotomy/Pulpectomy", price: "50000" },
    { name: "Stainless Steel Crown", price: "75000" },
    { name: "Band & Loop Space Maintainers", price: "60000" },
    { name: "LLA & TPA Space Maintainers", price: "70000" },
    { name: "Essix Retainer", price: "100000" },
    { name: "Crown Cementation", price: "30000" },
    { name: "Esthetic Tooth Filling", price: "35000" },
    { name: "Zirconium Crown", price: "250000" },
    { name: "Gold Crown", price: "0" },
    { name: "Flexible Denture (per tooth)", price: "75000" },
    { name: "Flexible Denture (2nd tooth)", price: "40000" },
    { name: "Metallic Crown", price: "70000" },
    { name: "Dental Implant – One Tooth", price: "1200000" },
    { name: "Dental Implant – Two Teeth", price: "1800000" },
    { name: "Orthodontist Consult", price: "20000" },
    { name: "Partial Denture", price: "50000" },
    { name: "Denture Repair", price: "30000" },
    { name: "GIC Filling", price: "40000" },
    { name: "Braces Consultation", price: "20000" },
    { name: "Braces", price: "0" },
    { name: "Fluoride Treatment", price: "35000" },
    { name: "Intermaxillary Fixation", price: "150000" },
    { name: "Aligners", price: "0" },
    { name: "E-Max Crown", price: "300000" },
];

async function seed() {
    console.log('🌱 Starting billing data seeding...');

    const pool = createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: Number(process.env.DB_PORT || 3306),
    });

    const db = drizzle(pool, { schema, mode: 'default' });

    try {
        // --- Seed HMO Providers ---
        const existingHmos = await db.query.hmoProviders.findFirst();
        if (existingHmos) {
            console.log('✅ HMO providers already exist. Skipping.');
        } else {
            console.log('⏳ Seeding HMO providers...');
            await db.insert(schema.hmoProviders).values(hmoData);
            console.log('✅ HMO providers seeded successfully!');
        }

        // --- Seed Service Items (Pricelist) ---
        const existingServices = await db.query.serviceItems.findFirst();
        if (existingServices) {
            console.log('✅ Service items (pricelist) already exist. Skipping.');
        } else {
            console.log('⏳ Seeding service items (pricelist)...');
            await db.insert(schema.serviceItems).values(serviceData);
            console.log('✅ Service items seeded successfully!');
        }

    } catch (error) {
        console.error('❌ Error during billing data seeding:', error);
        process.exit(1); // Exit with an error code
    } finally {
        await pool.end(); // Close the database connection pool
        console.log('🏁 Billing data seeding complete.');
    }
}

seed();
