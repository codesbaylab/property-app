import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <Legal title="Privacy policy" intro="This explains what Nestmap collects about you, why, and the choices you have. We collect only what the app needs to work.">
      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> your name, email address and password (stored securely, never in plain text).</li>
        <li><b>Listings you post:</b> price, details, address, map pin and photos. Once a listing is live, anyone can see it.</li>
        <li><b>Messages:</b> the chats you have with other users about listings.</li>
        <li><b>Activity:</b> homes you save and listings you report.</li>
        <li><b>Location:</b> only if you tap &ldquo;locate me&rdquo;, to centre the map. We do not store it.</li>
        <li><b>Technical data:</b> basic information such as device and browser type, used to keep the app working and secure.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account, show your listings and deliver your messages.</li>
        <li>To review listings and keep the platform safe from fraud and abuse.</li>
        <li>To send you messages about your account and activity.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>Who can see what</h2>
      <ul>
        <li>The public sees your listings. Your email and password are never shown to other users.</li>
        <li>People you message see your name and what you write to them.</li>
        <li>Our review team can see listings, reports and account details when they need to, to keep the platform safe.</li>
      </ul>

      <h2>Who helps us run Nestmap</h2>
      <p>We use trusted services to host the app, store data and photos, and show maps. They process data only to provide those services. We may also share information when the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>We keep your data while your account is open. When you delete a listing, its photos and details are removed. Some records, such as reports and review history, may be kept for a time to prevent abuse and meet legal duties.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Edit or delete your listings at any time from My homes.</li>
        <li>Ask us to correct or delete your account and data.</li>
        <li>Withdraw your consent for optional uses, such as alerts.</li>
      </ul>
      <p>You can use these rights under India&apos;s Digital Personal Data Protection Act, 2023. Reach us through Help &amp; support in your Profile.</p>

      <h2>Children</h2>
      <p>Nestmap is for people 18 and older. We do not knowingly collect data from children.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above, and tell you in the app if the change is important.</p>
    </Legal>
  );
}
