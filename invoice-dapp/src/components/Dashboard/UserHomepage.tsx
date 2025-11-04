import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, Shield, Zap, TrendingUp, Upload, Eye, FileText, ArrowRight, Sparkles } from 'lucide-react'
import CountUp from 'react-countup'

const UserHomepage = ({ onNavigateToDashboard }: { onNavigateToDashboard: () => void }) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  }

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      }
    }
  }

  const floatingAnimation = {
    animate: {
      y: [0, -10, 0],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  }

  const features = [
    {
      icon: FileText,
      title: "Smart OCR",
      description: "Automated invoice data extraction with AI"
    },
    {
      icon: Shield,
      title: "Secure Escrow",
      description: "Funds locked safely until verification"
    },
    {
      icon: Zap,
      title: "Instant Settlement",
      description: "Quick token transfers on blockchain"
    },
    {
      icon: TrendingUp,
      title: "Real-time Tracking",
      description: "Monitor invoice status live"
    }
  ]

  const steps = [
    {
      number: "01",
      title: "Upload Invoice",
      description: "Submit your invoice PDF or image"
    },
    {
      number: "02",
      title: "AI Verification",
      description: "Automated OCR extracts data"
    },
    {
      number: "03",
      title: "Audit & Approve",
      description: "Human review if needed"
    },
    {
      number: "04",
      title: "Get Paid",
      description: "Instant settlement to vendor"
    }
  ]

  const stats = [
    { label: "Invoices Processed", value: 1240 },
    { label: "Total Volume", value: 485 },
    { label: "Active Users", value: 340 }
  ]

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Vendor Manager",
      text: "VeriFi reduced our invoice processing time by 80%. Game changer!",
      avatar: "👩‍💼"
    },
    {
      name: "Mike Chen",
      role: "Finance Director",
      text: "The OCR accuracy is incredible. We've eliminated manual data entry.",
      avatar: "👨‍💼"
    },
    {
      name: "Emma Davis",
      role: "Operations Lead",
      text: "Getting paid instantly has transformed our cash flow management.",
      avatar: "👩‍🦰"
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Hero Section */}
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
              Get Paid <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-500">Instantly</span>
            </motion.h2>

            <motion.p 
              className="text-xl text-slate-300 mb-8"
              variants={fadeInUp}
            >
              VeriFi brings blockchain security to invoice verification. Upload, verify, and settle—all in seconds.
            </motion.p>

            <motion.div 
              className="flex flex-col sm:flex-row gap-4"
              variants={fadeInUp}
            >
              <motion.button
                onClick={onNavigateToDashboard}
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-green-700 flex items-center justify-center gap-2 group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Now
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
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
              className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-green-600/20 rounded-3xl blur-3xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
              className="relative bg-gradient-to-br from-slate-700 to-slate-800 border border-emerald-500/30 rounded-3xl p-8 flex flex-col justify-center items-center"
              variants={floatingAnimation}
              animate="animate"
            >
              <FileText className="w-24 h-24 text-emerald-400 mb-4" />
              <p className="text-center text-slate-300">Drag & drop your invoice</p>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-y border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <motion.div className="text-4xl font-bold text-emerald-400 mb-2">
                {isVisible && <CountUp end={stat.value} duration={2.5} suffix="+" />}
              </motion.div>
              <p className="text-slate-400">{stat.label}</p>
            </motion.div>
          ))}
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
          <p className="text-xl text-slate-400">Everything you need for secure invoice verification</p>
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
                <div className="hidden lg:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-emerald-500/50 to-transparent" />
              )}

              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 relative z-10 rounded-lg p-6">
                <motion.div
                  className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-green-600 rounded-full flex items-center justify-center mb-4 font-bold text-lg"
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

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          className="text-center mb-16"
          variants={fadeInUp}
          initial="initial"
          whileInView="animate"
        >
          <h3 className="text-4xl font-bold mb-4">Loved by Users</h3>
          <p className="text-xl text-slate-400">See what our customers say</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="bg-slate-800/50 border border-slate-700 h-full rounded-lg p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-4xl">{testimonial.avatar}</div>
                  <div>
                    <h4 className="font-bold">{testimonial.name}</h4>
                    <p className="text-slate-400 text-sm">{testimonial.role}</p>
                  </div>
                </div>
                <p className="text-slate-300 italic">"{testimonial.text}"</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <motion.div
          className="bg-gradient-to-r from-emerald-500/10 to-green-600/10 border border-emerald-500/30 rounded-3xl p-12 md:p-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
        >
          <motion.h3
            className="text-4xl md:text-5xl font-bold mb-6"
            variants={fadeInUp}
          >
            Ready to Transform Invoice Verification?
          </motion.h3>
          <motion.p
            className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto"
            variants={fadeInUp}
          >
            Join thousands of vendors using VeriFi for instant, secure payment verification on Solana.
          </motion.p>
          <motion.button
            onClick={onNavigateToDashboard}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-semibold hover:from-emerald-600 hover:to-green-700 text-lg flex items-center justify-center gap-2 mx-auto group"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Get Started Now
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 bg-slate-900/50 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-bold mb-4">VeriFi</h4>
              <p className="text-slate-400 text-sm">Verified Invoice Platform on Solana</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-emerald-400">Features</a></li>
                <li><a href="#" className="hover:text-emerald-400">Pricing</a></li>
                <li><a href="#" className="hover:text-emerald-400">Docs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-emerald-400">About</a></li>
                <li><a href="#" className="hover:text-emerald-400">Blog</a></li>
                <li><a href="#" className="hover:text-emerald-400">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Social</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-emerald-400">Twitter</a></li>
                <li><a href="#" className="hover:text-emerald-400">Discord</a></li>
                <li><a href="#" className="hover:text-emerald-400">GitHub</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center text-slate-400">
            <p>© 2025 VeriFi. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default UserHomepage
