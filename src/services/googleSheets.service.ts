// src/services/googleSheets.service.ts
import { google, sheets_v4 } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path'; // Import the 'path' module to handle file paths

dotenv.config();

export class GoogleSheetsService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    // Define the path to your JSON key file in the root directory
    // process.cwd() gets the current working directory (usually the project root)
    const keyFilePath = path.join(process.cwd(), 'credentials.json');

    // --- Added console.log for debugging ---
    console.log('--- Google Sheets Service Init ---');
    console.log('Attempting to load Google credentials from keyFile:', keyFilePath);
    // --- End of added console.log ---

    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath, // Point directly to the JSON key file
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // It's still good practice to keep the spreadsheet ID in an environment variable.
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1fu1uSvngE9QCzW7_eSDNxh3U3fuHDvekG7j46nmkw54';

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