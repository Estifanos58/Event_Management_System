import QRCode from "qrcode";

export async function generateInlineQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 260,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });
}
