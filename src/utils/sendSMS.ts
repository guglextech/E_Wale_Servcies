import axios from "axios";
import * as process from "process";
 

export async function sendVoucherSms(voucherData: {
   mobile: string;
   name: string;
   vouchers: Array<{ serial_number: string; pin: string }>;
   flow: 'self' | 'other';
   buyer_name?: string;
   buyer_mobile?: string;
}) {
   let message = "";
   
   // Format vouchers as "Serial number - PIN"
   const voucherTexts = voucherData.vouchers.map(v => `${v.serial_number} - ${v.pin}`);
   const voucherCodesText = voucherTexts.join('\n');

   if (voucherData.flow === 'other') {
       message = `Good news! ${voucherData.buyer_name} (${voucherData.buyer_mobile}) has purchased results checker voucher(s) for you!\n\n` +
                 `Your e-voucher(s):\n${voucherCodesText}\n\n` +
                 `Best of luck!`;
   } else {
       message = `Thank you for your purchase, ${voucherData.name}!\n\n` +
                 `Your e-voucher(s):\n${voucherCodesText}\n\n` +
                 `Best of luck!`;
   }

   console.log(`Sending voucher SMS to ${voucherData.mobile}:`, message);

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

       console.log("Voucher SMS sent successfully:", response);
       return true;
   } catch (error) {
       console.error("Error sending voucher SMS:", error);
       return false;
   }
}

module.exports = {  sendVoucherSms };

