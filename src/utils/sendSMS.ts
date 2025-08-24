import axios from "axios";
import * as process from "process";
 

export async function sendVoucherSms(voucherData: {
   mobile: string;
   name: string;
   voucher_codes: string[];
   flow: 'self' | 'other';
   buyer_name?: string;
   buyer_mobile?: string;
}) {
   let message = "";
   const voucherCodesText = voucherData.voucher_codes.join(', ');

   if (voucherData.flow === 'other') {
       message = `🎉 Good news! ${voucherData.buyer_name} (${voucherData.buyer_mobile}) has purchased voucher(s) for you!\n\n` +
                 `Voucher Code(s): ${voucherCodesText}\n\n` +
                 `This voucher can be used for the event. Keep it safe and present it at the venue for entry.\n\n` +
                 `Thank you and enjoy the event!`;
   } else {
       message = `🎉 Thank you for your purchase, ${voucherData.name}!\n\n` +
                 `Your voucher code(s): ${voucherCodesText}\n\n` +
                 `This voucher can be used for the event. Keep it safe and present it at the venue for entry.\n\n` +
                 `Good luck and enjoy the event!`;
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

// module.exports = { sendTicketSms, sendVoucherSms };