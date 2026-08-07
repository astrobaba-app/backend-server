require("dotenv").config();
const { sequelize } = require("../dbConnection/dbConfig");
const ContentBank = require("../model/horoscope/contentBank");
const { createChatCompletion } = require("../services/openaiClient");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// Configuration constants
const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const HOUSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
];
const PADAS = [1, 2, 3, 4];
const SEVERITIES = ['low', 'medium', 'high'];

// Helpers to build prompts
const PROMPT_BUILDERS = {
  planet: (p, s, h) => `
You are a senior traditional Vedic astrologer. Generate a highly detailed, premium narrative paragraph (exactly 6-8 sentences, ~150-180 words) describing the effects of planet ${p} placed in the zodiac sign ${s} and in the ${h} house of a natal chart.
Focus on personal traits, psychological impact, career, relationships, and finance. Use rich, premium Indian English. Avoid emojis or markdown formatting. No intro or outro text. Only the plain narrative text.`,

  // 1. Decoupled Ascendant prompts
  ascendant_description: (sign) => `
You are an expert Vedic astrologer. Write a premium, behavior-first paragraph (exactly 6-8 sentences, ~150-180 words) describing the temperament and core approach of a native with ${sign} Ascendant (Lagna).
Write directly to the user ("you"). Do not use lazy textbook adjectives like "intellectual", "detached", "mystical", "analytical", "highly", "extremely", "innate", or "inherent". Instead, describe their actual behaviors and how they operate in the workplace, at home, and in social circles.
Provide a realistic, balanced portrait: 60% on their positive potential and strengths, and 40% on their primary internal conflicts, behavioral blind spots, or developmental challenges. Frame it as direct, premium counsel. No introductory or closing remarks; output only the raw paragraph.`,

  ascendant_physical: (sign) => `
You are an expert Vedic astrologer. Write a premium paragraph (exactly 6-8 sentences, ~150-180 words) focusing on the physical presence, aura, body language, facial expression, style of movement, and overall aesthetic projection of a native with ${sign} Ascendant (Lagna).
Write directly to the user ("you"). Avoid deterministic statements ("you have a round face" or "you are tall"). Instead, use probabilistic, behavior-oriented language describing their non-verbal cues (e.g., how they walk, make eye contact, gesture, dress, or carry stress physically). Do not use academic jargon or textbook terms. Focus purely on physical aura, structural defaults, and external expression. No intro/outro; output only the raw paragraph.`,

  ascendant_relationship: (sign) => `
You are an expert Vedic astrologer. Write a premium paragraph (exactly 6-8 sentences, ~150-180 words) describing the relationship defaults, partnership style, and social bonding dynamics of a native with ${sign} Ascendant (Lagna).
Write directly to the user ("you"). Focus on concrete, behavioral examples of how they behave in close friendships, long-term romantic partnerships, and family dynamics. Detail how they handle emotional intimacy, deal with domestic conflict, and balance personal freedom with relational commitment. No abstract descriptions or textbook adjectives. No intro/outro; output only the raw paragraph.`,

  // 2. Decoupled Moon sign prompts
  moon_description: (sign) => `
You are an expert Vedic astrologer. Write a premium paragraph (exactly 6-8 sentences, ~150-180 words) describing the inner emotional baseline, subconscious instincts, and psychological triggers of a native with Moon in ${sign}.
Write directly to the user ("you"). Highlight their core emotional triggers (what makes them feel secure, anxious, or reactive) and how they process emotional setbacks. Explicitly describe how this placement interacts with their outer personality, noting potential conflicts if their Ascendant belongs to a contrasting element (like Air/Water or Fire/Earth). Avoid dry adjectives; focus on real behavioral responses. No intro/outro; output only the raw paragraph.`,

  moon_personality: (sign) => `
You are an expert Vedic astrologer. Write a premium paragraph (exactly 6-8 sentences, ~150-180 words) describing the cognitive style and everyday personality defaults of a native with Moon in ${sign}.
Write directly to the user ("you"). Use a clear cognitive metaphor to describe how they think and process reality (e.g., "filtering through logic", "absorbing emotional impressions"). Contrast at least two distinct behaviors (e.g., how they react under pressure versus when relaxed) to show a realistic, three-dimensional personality. Focus on decision-making styles and mental habits. No intro/outro; output only the raw paragraph.`,

  moon_health: (sign) => `
You are an expert Vedic astrologer. Write a premium paragraph (exactly 6-8 sentences, ~150-180 words) describing the somatic health tendencies and stress responses of a native with Moon in ${sign}.
Write directly to the user ("you"). Always lead with the primary physical organ systems or body parts associated with this sign (e.g., chest, stomach, nervous system). Explain the specific astrological mechanism of stress (how mental worry or emotional suppression manifests as physical fatigue or digestive issues). Conclude with one practical, non-medical remedy directly linked to this placement's energetic balance (e.g., breathing techniques, cold baths, walking near water). No intro/outro; output only the raw paragraph.`,

  nakshatra: (nak, pada) => `
You are a senior traditional Vedic astrologer. Generate a highly detailed, premium narrative paragraph (exactly 6-8 sentences, ~150-180 words) describing the instincts, destiny path, and unique personality traits of a native born with Moon in the Nakshatra of ${nak} at Pada ${pada}.
Use rich, premium Indian English. Avoid emojis or markdown formatting. No intro or outro text. Only the plain narrative text.`,

  dasha: (p, s, h) => `
You are an expert Vedic astrologer. Write a premium Mahadasha prediction paragraph (exactly 6-8 sentences, ~150-180 words) for the period of ${p} Mahadasha, when ${p} is placed in the sign of ${s} in the ${h} house.
Write directly to the user ("you"). Do not use any introductory template phrases like "During this period" or "With ${p} positioned". Start directly with the core prediction.
Structure the prediction as a clear three-stage chronological arc: describe how the dasha initiates (early phase), peak events or challenges (middle phase), and how it transitions/consolidates (late phase). Include a house-tied financial focus (e.g., 2nd/11th house influences or wealth-creating behaviors). Conclude with exactly three highly actionable, specific recommendations or instructions for managing this dasha's energy. Ensure there are no sign/house/placement leakages in the text (do not write "Because Mars is in the 4th house" or "For Taurus sign"). No intro/outro; output only the raw paragraph.`,

  rudraksha: (p, level) => `
You are a senior traditional Vedic astrologer. Generate a detailed recommendation explanation (exactly 4-5 sentences, ~100-120 words) for wearing the Rudraksha bead corresponding to the planet ${p} when its affliction/weakness severity is ${level}.
Explain how this bead shields against negative vibrations and supports the native's spiritual and mental clarity. Use rich, premium Indian English. No emojis or markdown. Only the plain narrative text.`,

  // 3. Specialized Gemstone prompts based on planet role
  gemstone: (asc, planet) => `
You are an expert Vedic astrologer. Write a premium description paragraph (exactly 4-5 sentences, ~100-120 words) for the gemstone of ${planet} recommended for a native.
Write directly to the user ("you"). Do not mention the name of the Ascendant sign or the planet's sign placement in the text (e.g., do not say "For ${asc} Ascendant" or "Since your ${planet} is in Aries"). The description must be completely sign-agnostic to prevent template leakage.
Lead immediately with WHY the stone is being worn in terms of its underlying planetary energy and house lordship benefits. Provide concrete, real-life areas of improvement (e.g., executive confidence, vocal clarity, digestive health, or social charisma) rather than abstract terms. No intro/outro; output only the raw paragraph.`,

  // 4. Decoupled Dosha prompts
  dosha_manglik: (state) => `
You are an expert Vedic astrologer. Write a premium, constructive analysis paragraph (exactly 6-8 sentences, ~150-180 words) of Manglik Dosh state: "${state}".
Write directly to the user ("you"). If the state is 'none', explain that the user has planetary freedom from this domestic affliction. If it is 'mild' or 'heavy', address the specific severity level, explaining how it impacts relationship dynamics, patience, and home harmony. Avoid fear-mongering terms like "curse", "ruin", or "marital failure". Instead, explain it as an intensity of energetic drive that requires conscious channeling. Provide three highly actionable, daily behavioral habits or specific remedies to balance and direct this Mars energy constructively. No intro/outro; output only the raw paragraph.`,

  dosha_sadesati: (phase) => `
You are an expert Vedic astrologer. Write a premium, constructive analysis paragraph (exactly 6-8 sentences, ~150-180 words) of Sade Sati phase: "${phase}".
Write directly to the user ("you"). Focus on the specific life areas impacted by this phase (e.g., career restructuring, mental resilience, or relationship testing). Explain it as a cycle of structural adjustment rather than a period of "punishment" or "doom". Provide three highly actionable, phase-specific behavioral guidelines or remedies (e.g., daily checklists, physical grounding, Saturn charity work) to help them navigate this period with grace and maturity. No intro/outro; output only the raw paragraph.`,

  dosha_kaalsarp: (type) => `
You are an expert Vedic astrologer. Write a premium, constructive analysis paragraph (exactly 6-8 sentences, ~150-180 words) of Kaal Sarp Dosh type: "${type}".
Write directly to the user ("you"). If type is 'none', explain that the user has complete planetary distribution freedom across the chart axis. If it is a present type, explain how this hemmed axis affects their career, delays, or psychological focus. Focus on constructive persistence and mindset shifting rather than fear-based concepts. Provide three highly actionable, practical remedies (like consistency in routines, breathwork, or charity) to master this energy. No intro/outro; output only the raw paragraph.`
};

// Mock generator for dry-runs
const generateMockText = (category, key) => {
  const words = [
    "astrological alignment", "karmic lessons", "planetary influence", "cosmic strength",
    "spiritual growth", "practical discipline", "auspicious developments", "potential blockages",
    "inner awareness", "material progress", "emotional balance", "vitality enhancement"
  ];
  const selectWord = () => words[Math.floor(Math.random() * words.length)];
  return `This is a pre-generated premium astrological narrative for key [${key}] under category [${category}]. The position suggests that the native will undergo a phase of significant ${selectWord()} and learn crucial ${selectWord()} that will shape their life approach. In terms of professional direction and personal development, maintaining structured consistency and avoiding impulsive decisions will bring the best results. Moreover, the integration of ${selectWord()} with regular daily routines acts as a protective shield, enhancing overall confidence and bringing progress across relationships, wealth, and spiritual pursuits.`;
};

// Main script execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--live") ? false : true;
  const overwrite = args.includes("--overwrite");
  
  // Parse limit
  const limitIdx = args.indexOf("--limit");
  const maxGenerations = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

  // Parse category filter
  const catIdx = args.indexOf("--category");
  const filterCat = catIdx !== -1 ? args[catIdx + 1] : null;

  console.log("--------------------------------------------------");
  console.log(`Starting Content Bank Generator`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (Simulating narratives locally)" : "LIVE (Calling OpenAI API)"}`);
  if (filterCat) console.log(`Filtered Category: ${filterCat}`);
  if (maxGenerations !== Infinity) console.log(`Generation Limit: ${maxGenerations}`);
  console.log("--------------------------------------------------");

  // Authenticate database
  try {
    await sequelize.authenticate();
    console.log("Database connection authenticated successfully.");
  } catch (err) {
    console.error("Database authentication failed:", err);
    process.exit(1);
  }

  // Sync ContentBank table just to be safe
  await ContentBank.sync();

  let generatedCount = 0;

  // Enumerate all combinations
  const tasks = [];

  // 1. Planet-Sign-House
  if (!filterCat || filterCat === "planet") {
    for (const p of PLANETS) {
      for (const s of SIGNS) {
        for (const h of HOUSES) {
          tasks.push({
            key: `planet:${p}:sign:${s}:house:${h}`,
            category: "planet",
            builder: () => PROMPT_BUILDERS.planet(p, s, h)
          });
        }
      }
    }
  }

  // 2. Ascendant (decoupled into description, physical, relationship)
  if (!filterCat || filterCat === "ascendant") {
    for (const s of SIGNS) {
      tasks.push({
        key: `ascendant:description:${s}`,
        category: "ascendant",
        builder: () => PROMPT_BUILDERS.ascendant_description(s)
      });
      tasks.push({
        key: `ascendant:physical:${s}`,
        category: "ascendant",
        builder: () => PROMPT_BUILDERS.ascendant_physical(s)
      });
      tasks.push({
        key: `ascendant:relationship:${s}`,
        category: "ascendant",
        builder: () => PROMPT_BUILDERS.ascendant_relationship(s)
      });
    }
  }

  // 3. Moon Sign (decoupled into description, personality, health)
  if (!filterCat || filterCat === "moon") {
    for (const s of SIGNS) {
      tasks.push({
        key: `moon:description:${s}`,
        category: "moon",
        builder: () => PROMPT_BUILDERS.moon_description(s)
      });
      tasks.push({
        key: `moon:personality:${s}`,
        category: "moon",
        builder: () => PROMPT_BUILDERS.moon_personality(s)
      });
      tasks.push({
        key: `moon:health:${s}`,
        category: "moon",
        builder: () => PROMPT_BUILDERS.moon_health(s)
      });
    }
  }

  // 4. Nakshatra-Pada
  if (!filterCat || filterCat === "nakshatra") {
    for (const n of NAKSHATRAS) {
      for (const p of PADAS) {
        tasks.push({
          key: `nakshatra:${n}:pada:${p}`,
          category: "nakshatra",
          builder: () => PROMPT_BUILDERS.nakshatra(n, p)
        });
      }
    }
  }

  // 5. Dasha Lord Narration
  if (!filterCat || filterCat === "dasha") {
    for (const p of PLANETS) {
      for (const s of SIGNS) {
        for (const h of HOUSES) {
          tasks.push({
            key: `dasha:${p}:sign:${s}:house:${h}`,
            category: "dasha",
            builder: () => PROMPT_BUILDERS.dasha(p, s, h)
          });
        }
      }
    }
  }

  // 6. Rudraksha
  if (!filterCat || filterCat === "rudraksha") {
    for (const p of PLANETS) {
      for (const level of SEVERITIES) {
        tasks.push({
          key: `rudraksha:${p}:severity:${level}`,
          category: "rudraksha",
          builder: () => PROMPT_BUILDERS.rudraksha(p, level)
        });
      }
    }
  }

  // 7. Gemstone
  if (!filterCat || filterCat === "gemstone") {
    for (const a of SIGNS) {
      for (const p of PLANETS) {
        tasks.push({
          key: `gemstone:ascendant:${a}:weakplanet:${p}`,
          category: "gemstone",
          builder: () => PROMPT_BUILDERS.gemstone(a, p)
        });
      }
    }
  }

  // 8. Dosha — decoupled into separate independent items
  if (!filterCat || filterCat === "dosha") {
    const manglikStates = ['none', 'mild', 'heavy'];
    const sadesatiPhases = ['free', 'rising', 'peak', 'setting', 'post'];
    const kaalsarpTypes = [
      'none', 'anant', 'kulik', 'vasuki', 'shankhapal', 'padma',
      'mahapadma', 'takshak', 'karkotak', 'shankhnaad', 'patak', 'vishadhar', 'sheshnag'
    ];

    for (const m of manglikStates) {
      tasks.push({
        key: `dosha:manglik:${m}`,
        category: "dosha",
        builder: () => PROMPT_BUILDERS.dosha_manglik(m)
      });
    }

    for (const ss of sadesatiPhases) {
      tasks.push({
        key: `dosha:sadesati:${ss}`,
        category: "dosha",
        builder: () => PROMPT_BUILDERS.dosha_sadesati(ss)
      });
    }

    for (const ks of kaalsarpTypes) {
      tasks.push({
        key: `dosha:kaalsarp:${ks}`,
        category: "dosha",
        builder: () => PROMPT_BUILDERS.dosha_kaalsarp(ks)
      });
    }
  }

  console.log(`Total combinations queued: ${tasks.length}`);
  console.log("Beginning generation loop...");

  for (const task of tasks) {
    if (generatedCount >= maxGenerations) {
      console.log(`\nReached limit of ${maxGenerations} generations. Exiting.`);
      break;
    }

    // Check if key already exists to prevent double writing / spending money
    const existing = await ContentBank.findByPk(task.key);
    if (existing && !overwrite) {
      continue;
    }

    let textContent = "";

    try {
      if (dryRun) {
        // Generate locally simulated content
        textContent = generateMockText(task.category, task.key);
      } else {
        // Call live OpenAI chat completions
        const prompt = task.builder();
        console.log(`[OpenAI] Calling model for key: ${task.key}...`);
        
        const completion = await createChatCompletion({
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: "You are an elite Vedic astrologer content writer. Output only the requested narrative text without headers or intro/outro formatting." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 300
        }, { feature: "content_bank_batch_gen", key: task.key });

        textContent = completion.choices[0]?.message?.content?.trim() || "";
        
        // Brief sleep to respect API rate limits (e.g. 200ms)
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (textContent) {
        if (existing) {
          // Overwrite the existing content
          await existing.update({
            text: textContent,
            tags: { regeneratedAt: new Date().toISOString(), generatorMode: dryRun ? "mock" : "live" }
          });
        } else {
          // Save to Database
          await ContentBank.create({
            key: task.key,
            category: task.category,
            text: textContent,
            version: 1,
            tags: { generatedAt: new Date().toISOString(), generatorMode: dryRun ? "mock" : "live" }
          });
        }

        generatedCount++;
        if (generatedCount % 50 === 0 || dryRun) {
          process.stdout.write(`Progress: ${generatedCount} items created...\r`);
        }
      }
    } catch (err) {
      console.error(`\n[ERROR] Failed to generate for key ${task.key}:`, err.message);
      // Wait a bit longer on error before continuing
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log(`\nGeneration process completed. Generated ${generatedCount} keys.`);
  process.exit(0);
}

main();
