This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Email Configuration (Gmail SMTP)

Transactional notifications are sent through Gmail SMTP.

Add these environment variables before running the worker:

```bash
GMAIL_SMTP_USER=your-address@gmail.com
GMAIL_SMTP_APP_PASSWORD=your-gmail-app-password
EMAIL_FROM_NAME="Dinkinesh - EEMS"
EMAIL_FROM_ADDRESS=your-address@gmail.com
EMAIL_REPLY_TO=support@your-domain.com
```

Notes:

- Use a Gmail App Password (not your normal account password).
- Start the worker to process notification deliveries: `npm run worker`.
- Notification emails are queued and retried using the `NotificationDelivery` pipeline.

Staging and production checklist:

- Run a dedicated worker process in the deployment (separate from web process) so queued deliveries leave `PENDING`.
- Verify `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD` are defined in the worker environment.
- Trigger a test notification and confirm `NotificationDelivery` progresses from `PENDING` to `SENT`.
- If delivery fails, inspect `failureReason` and attempt history from the Notifications page.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
