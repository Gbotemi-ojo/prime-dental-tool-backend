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

      // Authenticate using the credentials from environment variables
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: clientEmail,
          private_key: formattedPrivateKey,
        },
        // --- MODIFICATION START ---
        // Changed scope to allow both reading AND writing/appending to spreadsheets
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        // --- MODIFICATION END ---
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
        range: 'Sheet1!A:F', // Adjust this range based on your sheet structure
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

  /**
   * Appends receipt data to the Google Sheet.
   * @param receiptData The structured data of the receipt.
   * This includes fields like receiptDate, patientName, patientEmail, servicesRendered,
   * calculatedSubtotal, hmoProvider, hmoCoveredAmount, totalDueFromPatient,
   * paymentMethod, and formattedTimestamp.
   */
  async appendReceipts(receiptData: any): Promise<void> {
    if (!this.sheets) {
      console.error('Google Sheets client not initialized. Cannot append receipt data.');
      throw new Error('Google Sheets service not ready.');
    }

    try {
      // Extract and format data for the Google Sheet row
      const receiptDate = receiptData.receiptDate || 'N/A'; // Receipt number removed as per request
      const patientName = receiptData.patientName || 'N/A';
      const patientEmail = receiptData.patientEmail || 'N/A';
      const hmoProvider = receiptData.hmoProvider && receiptData.hmoProvider !== 'N/A' ? receiptData.hmoProvider : 'N/A';
      const hmoCoveredAmount = (receiptData.hmoCoveredAmount || 0).toFixed(2);
      const paymentMethod = receiptData.paymentMethod || 'N/A';

      // Calculate subtotal from items if available
      const calculatedSubtotal = receiptData.items ? receiptData.items.reduce((sum: number, item: any) => sum + (item.amount || 0), 0) : 0;
      const totalDueFromPatient = (calculatedSubtotal - parseFloat(hmoCoveredAmount)).toFixed(2);

      // Format services rendered into a readable string
      const servicesRendered = receiptData.items && Array.isArray(receiptData.items)
        ? receiptData.items.map((item: any) => `${item.description} (₦${item.amount.toFixed(2)})`).join('; ')
        : 'No services listed';

      const now = new Date();
      const formattedTimestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

      const rowData = [
        receiptDate,
        patientName,
        patientEmail,
        servicesRendered,
        calculatedSubtotal.toFixed(2),
        hmoProvider,
        hmoCoveredAmount,
        totalDueFromPatient,
        paymentMethod,
        formattedTimestamp,
      ];

      const range = 'Sheet2!A:J';

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });
      console.log('Successfully appended receipt data to Google Sheet.');
    } catch (error: any) {
      console.error('Error appending receipt data to Google Sheet:', error.message);
      if (error.response && error.response.data) {
        console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to append receipt data to Google Sheet: ${error.message}`);
    }
  }

  /**
   * Fetches all receipt data from Sheet2 of the Google Spreadsheet.
   * @returns A Promise that resolves to an array of arrays, where each inner array represents a row of data.
   * Returns an empty array if no data is found or an error occurs.
   */
  async getReceiptsData(): Promise<any[][]> {
    if (!this.sheets) {
      console.error('Google Sheets client not initialized. Cannot fetch receipt data.');
      throw new Error('Google Sheets service not ready.');
    }

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Sheet2!A:J', // Specify the range covering all your receipt data columns
      });

      const rows = response.data.values;
      if (rows && rows.length > 0) {
        console.log(`Successfully fetched ${rows.length} rows from Google Sheet.`);
        return rows;
      } else {
        console.log('No data found in Sheet2.');
        return [];
      }
    } catch (error: any) {
      console.error('Error fetching receipt data from Google Sheet:', error.message);
      if (error.response && error.response.data) {
        console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to fetch receipt data from Google Sheet: ${error.message}`);
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
