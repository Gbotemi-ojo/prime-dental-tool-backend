import db from "./db/index"; // your drizzle db connection
import { jobs } from "./db/schema"; // your jobs table definition

async function seedJobs() {
  try {
    const connection = await db;
    // Insert sample job postings
    await connection.insert(jobs).values({
      title: "Software Engineer",
      description: "Develop and maintain web applications using modern technologies.",
      isOpen: true,
    });
    await connection.insert(jobs).values({
      title: "Product Manager",
      description: "Oversee product development from ideation to launch.",
      isOpen: true,
    });
    await connection.insert(jobs).values({
      title: "Data Analyst",
      description: "Analyze data and provide actionable insights to drive business decisions.",
      isOpen: true,
    });
    console.log("Jobs seeded successfully!");
  } catch (error) {
    console.error("Error seeding jobs:", error);
  } finally {
    process.exit(0);
  }
}

seedJobs();
