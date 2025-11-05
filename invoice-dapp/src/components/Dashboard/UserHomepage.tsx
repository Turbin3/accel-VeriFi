import { useState, useEffect } from "react";
import { easeInOut, motion } from "framer-motion";
import {
  Shield,
  Zap,
  TrendingUp,
  FileText,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import team1 from "../../assets/ab.jpg";
import team2 from "../../assets/dp.jpg";
import team3 from "../../assets/sd.jpg";
import team4 from "../../assets/gz.jpg";
import team5 from "../../assets/jk.jpg";
import team6 from "../../assets/ss.jpg";
// import team7 from "../../assets/sd.jpg";

const UserHomepage = ({
  onNavigateToDashboard,
}: {
  onNavigateToDashboard: () => void;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 },
  };

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const floatingAnimation = {
    animate: {
      y: [0, -10, 0],
    },
    transition: {
      duration: 0.5,
      repeat: Infinity,
      ease: easeInOut,
    },
  };

  const features = [
    {
      icon: FileText,
      title: "Smart OCR",
      description: "Automated invoice data extraction with AI",
    },
    {
      icon: Shield,
      title: "Secure Escrow",
      description: "Funds locked safely until verification",
    },
    {
      icon: Zap,
      title: "Instant Settlement",
      description: "Quick token transfers on blockchain",
    },
    {
      icon: TrendingUp,
      title: "Real-time Tracking",
      description: "Monitor invoice status live",
    },
  ];

  const steps = [
    {
      number: "01",
      title: "Upload Invoice",
      description: "Submit your invoice PDF or image",
    },
    {
      number: "02",
      title: "AI Verification",
      description: "Automated OCR extracts data",
    },
    {
      number: "03",
      title: "Audit & Approve",
      description: "Human review if needed",
    },
    {
      number: "04",
      title: "Get Paid",
      description: "Instant settlement to vendor",
    },
  ];

  // Randomized image assignments
  const teamMembers = [
    {
      id: 1,
      name: "AbduoVo",
      twitter: "https://x.com/AbduoVo",
      image: team1,
    },
    {
      id: 2,
      name: "JayaKrishna",
      twitter: "https://x.com/jkdotsol",
      image: team5,
    },
    {
      id: 3,
      name: "Ghazal",
      twitter: "https://x.com/GhazalAssa36725",
      image: team4,
    },
    {
      id: 4,
      name: "SolDaddy",
      twitter: "https://x.com/SolDadddyy",
      image: team3,
    },
    {
      id: 5,
      name: "Div Patel",
      twitter: "https://x.com/Div5533/",
      image: team2,
    },
    {
      id: 6,
      name: "Shrinjoy",
      twitter: "https://x.com/ShrinjoyS/",
      image: team6,
    },
    // {
    //   id: 7,
    //   name: "Ayush",
    //   twitter: "https://x.com/ShrinjoyS/",
    //   image: team6,
    // },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* ... Hero Section ... */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          variants={staggerContainer}
          animate="animate"
        >
          {/* Left Content */}
          <motion.div variants={fadeInUp}>
            <motion.div
              className="inline-block mb-6"
              whileHover={{ scale: 1.05 }}
            >
              <div className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-sm font-medium flex items-center gap-2 w-fit">
                <Sparkles className="w-3 h-3" />
                The Future of Invoice Verification
              </div>
            </motion.div>

            <motion.h2
              className="text-5xl md:text-6xl font-bold mb-6 leading-tight"
              variants={fadeInUp}
            >
              Get Paid{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 to-green-500">
                Instantly
              </span>
            </motion.h2>

            <motion.p
              className="text-xl text-slate-300 mb-8"
              variants={fadeInUp}
            >
              VeriFi brings blockchain security and AI together. <br></br>
              <b>
                A <span className="text-green-400">Turbin3</span> Product
              </b>
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4"
              variants={fadeInUp}
            >
              <motion.button
                onClick={onNavigateToDashboard}
                className="px-8 py-3 bg-linear-to-r from-emerald-500 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-green-700 flex items-center justify-center gap-2 group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Now
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
                onClick={() =>
                  window.open(
                    "https://github.com/Turbin3/accel-VeriFi/",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                className="px-8 py-3 border-2 border-emerald-500/50 text-emerald-400 rounded-lg font-semibold hover:bg-emerald-500/10"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                >
                Learn More
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Right Visual */}
          <motion.div
            className="relative h-96"
            animate={isVisible ? "animate" : ""}
          >
            <motion.div
              className="absolute inset-0 bg-linear-to-br from-emerald-500/20 to-green-600/20 rounded-3xl blur-3xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
              className="relative bg-linear-to-br from-slate-700 to-slate-800 border border-emerald-500/30 rounded-3xl p-8 flex flex-col justify-center items-center"
              variants={floatingAnimation}
              animate="animate"
            >
              <FileText className="w-24 h-24 text-emerald-400 mb-4" />
              <p className="text-center text-slate-300">
                Drag & drop your invoice
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Meet the Team Section*/}
      <section className="relative w-full px-6 py-28 bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
        {/* Subtle diagonal background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(30,30,30,0.5)_25%,transparent_25%,transparent_50%,rgba(30,30,30,0.5)_50%,rgba(30,30,30,0.5)_75%,transparent_75%,transparent)] bg-size[60px_60px] opacity-10 skew-y-3 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Heading */}
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-5xl font-extrabold mb-4 tracking-tight">
              Meet the <span className="text-emerald-400">Team!</span>
            </h3>
            <p className="text-xl text-slate-400">
              The brilliant minds behind{" "}
              <span className="font-semibold text-emerald-400">VeriFi</span>
            </p>
          </motion.div>

          {/* Team Grid */}
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-10 justify-items-center skew-y-1"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ staggerChildren: 0.1, delayChildren: 0.2 }}
          >
            {teamMembers.map((member, i) => (
              <motion.div
                key={member.id}
                className="relative flex flex-col items-center text-center group transform transition-all duration-300"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.1, rotateY: 5 }}
                transition={{
                  type: "spring",
                  stiffness: 120,
                  damping: 12,
                }}
              >
                {/* Circular glowing border on hover */}
                <div className="absolute w-36 h-36 rounded-full bg-linear-to-br from-emerald-500/30 to-green-500/10 blur-lg opacity-0 group-hover:opacity-100 transition-all duration-700" />

                {/* Avatar */}
                <motion.a
                  href={member.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative w-32 h-32 rounded-full border-4 border-emerald-500/40 overflow-hidden shadow-md shadow-emerald-500/10 bg-slate-800/60 group-hover:border-emerald-400 transition-all duration-500"
                  whileHover={{ scale: 1.15 }}
                >
                  <motion.img
                    src={member.image}
                    alt={member.name}
                    className="w-full h-full object-cover"
                    animate={{
                      y: [0, -6, 0],
                    }}
                    transition={{
                      duration: 3 + i * 0.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </motion.a>

                {/* Name */}
                <motion.h4
                  className="text-lg font-semibold mt-4 text-white tracking-wide"
                  whileHover={{ scale: 1.1 }}
                >
                  {member.name}
                </motion.h4>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="initial"
          whileInView="animate"
        >
          <h3 className="text-4xl font-bold mb-4">Why Choose VeriFi?</h3>
          <p className="text-xl text-slate-400">
            Everything you need for secure invoice verification
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
        >
          {features.map((feature, i) => (
            <motion.div key={i} variants={fadeInUp}>
              <div className="bg-slate-800/50 border border-slate-700 hover:border-emerald-500/50 transition-all group cursor-pointer h-full rounded-lg p-6">
                <motion.div
                  className="w-12 h-12 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-500/30 transition-colors"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  <feature.icon className="w-6 h-6 text-emerald-400" />
                </motion.div>
                <h4 className="text-lg font-bold mb-2">{feature.title}</h4>
                <p className="text-slate-400 text-sm">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-y border-slate-700/50">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="initial"
          whileInView="animate"
        >
          <h3 className="text-4xl font-bold mb-4">How It Works</h3>
          <p className="text-xl text-slate-400">4 simple steps to get paid</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-full w-full h-0.5 bg-linear-to-r from-emerald-500/50 to-transparent" />
              )}

              <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 relative z-10 rounded-lg p-6">
                <motion.div
                  className="w-12 h-12 bg-linear-to-r from-emerald-500 to-green-600 rounded-full flex items-center justify-center mb-4 font-bold text-lg"
                  whileHover={{ scale: 1.1 }}
                >
                  {step.number}
                </motion.div>
                <h4 className="text-lg font-bold mb-2">{step.title}</h4>
                <p className="text-slate-400 text-sm">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Story Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
        >
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Breakout Room 1
          </h2>
          <p className="text-xl md:text-2xl text-slate-300 max-w-4xl mx-auto leading-relaxed">
            The product was once a chaotic idea that took shape during Q4
            Accelerated Builders 2025
          </p>
        </motion.div>
      </section>
    </div>
  );
};

export default UserHomepage;
