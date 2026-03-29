import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, customSession, magicLink } from 'better-auth/plugins';
import { prisma } from './db';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  plugins: [
    bearer(),
    magicLink({
      expiresIn: 60 * 30, // 30 minutes
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: email,
          subject: 'Your Backstage sign-in link',
          text: `Click to sign in to Backstage: ${url}`,
        });
      },
    }),
    customSession(async ({ user, session }) => {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });

      return {
        user: {
          ...user,
          role: dbUser?.role,
        },
        session,
      };
    }),
  ],
  database: prismaAdapter(prisma, {
    provider: 'mysql',
  }),
  trustedOrigins: [
    'http://localhost:3000',
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ],
  ...(process.env.NODE_ENV === 'production' && {
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: 'glitchbars.com',
      },
    },
  }),
});
