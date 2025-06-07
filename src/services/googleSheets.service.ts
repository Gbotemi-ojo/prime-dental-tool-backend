// src/services/googleSheets.service.ts
import { google, sheets_v4 } from 'googleapis'; // Import sheets_v4 for types
import * as dotenv from 'dotenv'; // Import dotenv

// Load environment variables from .env file in development
// This line should ideally be at the very top of your application's entry file (e.g., app.ts or server.ts)
// but placing it here ensures they are loaded when this service is initialized.
dotenv.config();

export class GoogleSheetsService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    // Construct the credentials object from environment variables
    const credentials = {
      type: process.env.GOOGLE_TYPE,
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      // Ensure newlines are correctly parsed for the private_key
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI,
      token_uri: process.env.GOOGLE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
      universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN,
    };

    // Validate that required credentials are present
    if (!credentials.private_key || !credentials.client_email) {
      console.error('Missing Google service account credentials in environment variables.');
      throw new Error('Google service account credentials not configured.');
    }

    const auth = new google.auth.GoogleAuth({
      credentials, // Pass the constructed credentials object
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || 'YOUR_DEFAULT_SPREADSHEET_ID_HERE'; 
    // It's a good practice to also store the spreadsheet ID in an environment variable.
    // If not set, it will fallback to the hardcoded ID for now.

    // Authenticate and create a Google Sheets client
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Appends a new row of data to the specified Google Sheet.
   * @param data An array of values representing a single row to append.
   * e.g., [name, sex, dateOfBirth, phoneNumber, email, firstAppointment]
   */
  async appendRow(data: any[]): Promise<void> {
    if (!this.sheets) {
      console.error('Google Sheets client not initialized. Cannot append row.');
      throw new Error('Google Sheets service not ready.');
    }

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Sheet1!A:F', // Assuming your sheet has columns A-F for these fields
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [data],
        },
      });
      console.log('Successfully appended row to Google Sheet.');
    } catch (error: any) {
      console.error('Error appending data to Google Sheet:', error.message, error.stack);
      // You might want to re-throw a custom error or handle it gracefully
      throw new Error(`Failed to append data to Google Sheet: ${error.message}`);
    }
  }

  // You can add other methods here, e.g., readSheetData, updateCell, etc.
}

export const googleSheetsService = new GoogleSheetsService();
