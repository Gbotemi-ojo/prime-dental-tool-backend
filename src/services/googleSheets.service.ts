// src/services/googleSheets.service.ts
import { google, sheets_v4 } from 'googleapis';
import * as dotenv from 'dotenv';

// Initialize dotenv to load environment variables from a .env file
dotenv.config();

export class GoogleSheetsService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    console.log('--- Initializing Google Sheets Service ---');

    try {
      // --- MODIFICATION START ---
      // Get credentials directly from environment variables for better security
      const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_PRIVATE_KEY;
      this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID as string;

      // Validate that the environment variables are loaded
      if (!clientEmail || !privateKey || !this.spreadsheetId) {
        throw new Error(
          "Missing Google credentials in environment variables. Please ensure GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SPREADSHEET_ID are set in your .env file."
        );
      }

      // The private key from an environment variable often has literal '\n' characters.
      // These need to be replaced with actual newline characters for the JWT signing.
      const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
      // --- MODIFICATION END ---

      // Authenticate using the credentials from environment variables
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: formattedPrivateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      // Authenticate and create a Google Sheets client
      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('Google Sheets client initialized successfully.');

    } catch (error: any) {
      console.error('--- FATAL ERROR during Google Sheets Service initialization ---');
      console.error(error.message);
      // Throw the error to prevent the application from running with a misconfigured service
      throw error;
    }
  }

  /**
   * Appends a new row of data to the specified Google Sheet.
   * @param data An array of values representing a single row to append.
   */
  async appendRow(data: any[]): Promise<void> {
    if (!this.sheets) {
      console.error('Google Sheets client not initialized. Cannot append row.');
      throw new Error('Google Sheets service not ready.');
    }

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Sheet1!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [data],
        },
      });
      console.log('Successfully appended row to Google Sheet.');
    } catch (error: any) {
      console.error('Error appending data to Google Sheet:', error.message);
      if (error.response && error.response.data) {
        console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to append data to Google Sheet: ${error.message}`);
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();