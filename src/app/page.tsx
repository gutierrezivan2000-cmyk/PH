import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { SocialProof } from "@/components/landing/SocialProof";
import { VideoDemo } from "@/components/landing/VideoDemo";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Benefits } from "@/components/landing/Benefits";
import { Testimonials } from "@/components/landing/Testimonials";
import { Objections } from "@/components/landing/Objections";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <Hero />
      <SocialProof />
      <VideoDemo />
      <ProblemSolution />
      <Features />
      <HowItWorks />
      <Benefits />
      <Testimonials />
      <Objections />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
