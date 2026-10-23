import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <Legal title="Terms of use" intro="These terms are the rules for using Nestmap to find, list and enquire about homes. By creating an account or using the app you agree to them.">
      <h2>What Nestmap is</h2>
      <p>Nestmap is a place where property owners and agents list homes, and where people looking to buy or rent can find them on a map. We are a listing platform. We are not a party to any sale, rent or agreement between you and another person, and we do not guarantee that any listing is accurate, available or lawful.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give true details and keep your password private. You are responsible for what happens on your account.</li>
        <li>You must be 18 or older.</li>
        <li>We may suspend or remove an account that breaks these terms or puts others at risk.</li>
      </ul>

      <h2>Posting a listing</h2>
      <ul>
        <li>Only list a property you own, or that you are authorised to sell or rent out.</li>
        <li>Price, size, photos, address and the map pin must be true and current. Photos must be of the property itself.</li>
        <li>Every listing is reviewed by our team before it goes live. We may reject, hide or remove a listing, with a reason where we can.</li>
        <li>Mark a listing as sold or rented when it is no longer available.</li>
        <li>Accounts can have up to 3 free listings. Paid plans, if we add them, will show their price before you pay.</li>
      </ul>

      <h2>What you must not do</h2>
      <ul>
        <li>Post fake, misleading or duplicate listings, or ones you have no right to list.</li>
        <li>Ask for or take money outside a genuine transaction, or use the app to scam or harass anyone.</li>
        <li>Share other people&apos;s personal details, or upload content you do not own.</li>
        <li>Scrape the app, bulk copy listings, or try to break or overload it.</li>
      </ul>

      <h2>Messages and meeting people</h2>
      <p>Messages in Nestmap are between you and the other person. Be careful when you pay any money or visit a property: see it in person, check the documents, and never pay a deposit before you have verified the owner. You can report a listing or a person from the app and we will look into it.</p>

      <h2>Your content</h2>
      <p>You keep ownership of the photos and text you upload. You give Nestmap permission to show them in the app, on shared listing links and in previews, for as long as the listing is up. Do not upload anything you do not have the right to share.</p>

      <h2>Our responsibility</h2>
      <p>We work to keep Nestmap running and listings genuine, but the app is provided as it is. To the extent the law allows, we are not liable for losses from a deal you make with another person, for wrong or out-of-date listing details, or for the app being unavailable for a time.</p>

      <h2>Changes and law</h2>
      <p>We may update these terms and will change the date above when we do. Using the app after a change means you accept it. These terms are governed by the laws of India.</p>

      <h2>Contact</h2>
      <p>Questions or complaints: use Help &amp; support in your Profile.</p>
    </Legal>
  );
}
