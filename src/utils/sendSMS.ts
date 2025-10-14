import axios from "axios";
import * as process from "process";

/**
 * Get display name for voucher type
 */
function getVoucherTypeDisplay(voucherType: string): string {
   const typeMap = {
       'BECE': 'BECE Results Checker',
       'WASSCE': 'WASSCE/Nov/Dec Results Checker'
   };
   return typeMap[voucherType] || 'Results Checker';
}
 

export async function sendVoucherSms(voucherData: {
   mobile: string;
   name: string;
   vouchers: Array<{ serial_number: string; pin: string }>;
   flow: 'self' | 'other';
   buyer_name?: string;
   buyer_mobile?: string;
   voucherType?: string;
}) {
   let message = "";
   
   // Determine voucher type for display
   const voucherType = voucherData.voucherType || 'BECE';
   const voucherTypeDisplay = getVoucherTypeDisplay(voucherType);
   
   // Format vouchers professionally
   const voucherTexts = voucherData.vouchers.map((v, index) => 
       `${index + 1}. ${v.serial_number} - ${v.pin}`
   );
   const voucherCodesText = voucherTexts.join('\n');

   if (voucherData.flow === 'other') {
       message = `E-Wale Services\n\n` +
                 `Hi ${voucherData.name}! ${voucherData.buyer_name} bought ${voucherTypeDisplay} voucher(s) for you.\n\n` +
                 `VOUCHERS:\n${voucherCodesText}\n\n` +
                 `Use: Visit results portal & enter Serial + PIN\n\n` +
                 `Good luck!`;
   } else {
       message = `E-Wale Services\n\n` +
                 `Hi ${voucherData.name}! Your ${voucherTypeDisplay} voucher(s) are ready.\n\n` +
                 `VOUCHERS:\n${voucherCodesText}\n\n` +
                 `Use: Visit results portal & enter Serial + PIN\n\n` +
                 `Good luck!`;
   }

   console.log(`=====> Sending voucher SMS to ${voucherData.mobile}:`, message);

   try {
       const response = await axios.get(process.env.SMS_URL, {
           params: {
               clientsecret: process.env.SMS_CLIENT_SECRET,
               clientid: process.env.SMS_CLIENT_ID,
               from: process.env.SMS_SENDER,
               to: voucherData.mobile,
               content: message,
           },
       });

       return true;
   } catch (error) {
       return false;
   }
}

module.exports = {  sendVoucherSms };