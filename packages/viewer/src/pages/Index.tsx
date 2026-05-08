import { Nav } from "@/components/rendersend/Nav";
import { Hero } from "@/components/rendersend/Hero";
import { HowItWorks } from "@/components/rendersend/HowItWorks";
import { ZeroAccess } from "@/components/rendersend/ZeroAccess";
import { FinanceTeams } from "@/components/rendersend/FinanceTeams";
import { Pricing } from "@/components/rendersend/Pricing";
import { FAQ } from "@/components/rendersend/FAQ";
import { Footer } from "@/components/rendersend/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <ZeroAccess />
        <FinanceTeams />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
