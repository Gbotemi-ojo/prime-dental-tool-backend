// src/services/googleSheets.service.ts
import { google, sheets_v4 } from 'googleapis'; // Import sheets_v4 for types

export class GoogleSheetsService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    // Ensure you have your credentials.json file in the root of your backend project
    // or configure it via environment variables for production.
    const auth = new google.auth.GoogleAuth({
      keyFile: 'credentials.json', // Path to your Google service account credentials
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.spreadsheetId = '1fu1uSvngE9QCzW7_eSDNxh3U3fuHDvekG7j46nmkw54'; // Your specific spreadsheet ID

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