import type { PlaceResult } from "../types";

/** A fully researched place: every later-phase field filled. */
export type FullPlace = PlaceResult &
  Required<Pick<PlaceResult, "menu" | "tasteFit" | "journey">>;

export const PLACES: FullPlace[] = [
  {
    id: "fogo-de-chao-bishopsgate",
    hygieneRating: 5,
    whyThis: "First rodizio on your list; the caipirinha fits your rum and citrus picks.",
    name: "Fogo de Chão",
    type: "Brazilian steakhouse (rodizio)",
    neighbourhood: "Bishopsgate, London",
    priceTier: "££££",
    overview: {
      rating: 4.2,
      reviewCount: 126,
      address: "100 Bishopsgate, London EC2M 1GT",
      openStatus: "Open now · dinner until 21:00",
      reviewQuotes: [
        {
          text: "Every cut of meat — steak, chicken, pork — cooked to perfection.",
          sentiment: "positive",
        },
        { text: "Great value for money, generous portions.", sentiment: "positive" },
        { text: "One large private event had slow service.", sentiment: "negative" },
      ],
    },
    menu: {
      items: [
        { name: "Picanha & fillet churrasco", matchesTaste: true },
        { name: "Roasted bone marrow, chimichurri", matchesTaste: true },
        { name: "Butter-bathed lobster tail", price: "premium add-on", matchesTaste: false },
        { name: "Caipirinha", price: "£14.50", matchesTaste: true },
        { name: "Lobster mac and cheese", matchesTaste: false },
      ],
    },
    tasteFit: {
      score: 7.5,
      reasoning:
        "No steakhouse baseline yet, so this would be your first rated rodizio experience. Your top drinks skew rum + citrus, and the Caipirinha (cachaça + lime) sits in that same citrus-forward family. You've also rated rich, meat-forward food highly (Pulled Pork Sandwich 9.6, Crispy Ebi Onigiri 9.5) — this menu fits that pattern.",
      misses: [],
    },
    journey: {
      totalMinutes: 22,
      legs: [
        {
          mode: "walking",
          line: "Walk",
          lineColor: "#9E9E9E",
          from: "Canary Wharf (One Canada Square)",
          to: "Canary Wharf Elizabeth line platform",
          durationMinutes: 7,
        },
        {
          mode: "elizabeth-line",
          line: "Elizabeth line",
          lineColor: "#6950A1",
          from: "Canary Wharf",
          to: "Liverpool Street",
          durationMinutes: 7,
        },
        {
          mode: "walking",
          line: "Walk",
          lineColor: "#9E9E9E",
          from: "Liverpool Street",
          to: "Fogo de Chão, 100 Bishopsgate",
          durationMinutes: 8,
        },
      ],
    },
  },
  {
    id: "sabor-mayfair",
    hygieneRating: 4,
    whyThis: "Low fit: the signature dishes miss what you rate highest.",
    name: "Sabor",
    type: "Spanish",
    neighbourhood: "Mayfair, London",
    priceTier: "£££",
    overview: {
      rating: 4.0,
      reviewCount: 890,
      address: "35-37 Heddon St, London W1B 4BR",
      openStatus: "Open now · closes 23:00",
      reviewQuotes: [
        {
          text: "Incredible tapas bar upstairs, but the downstairs dining room gets deafening by 8pm.",
          sentiment: "negative",
        },
        { text: "Some of the best Spanish food in London.", sentiment: "positive" },
      ],
    },
    menu: {
      items: [
        { name: "Jamón ibérico de bellota", price: "£28", matchesTaste: false },
        { name: "Chargrilled octopus", price: "£19", matchesTaste: true },
        { name: "Suckling pig, whole (feeds 6)", price: "£195", matchesTaste: false },
      ],
    },
    tasteFit: {
      score: 4.5,
      reasoning:
        "Octopus and grilled dishes track your higher-rated seafood picks, but the downstairs room's noise level matches a pattern you've marked down before.",
      misses: [
        "Loud, busy dining room — you've rated venues with this vibe low before (Padella, 5/10)",
        "Set tasting menus score below your average — you prefer ordering à la carte",
      ],
    },
    journey: {
      totalMinutes: 30,
      legs: [
        {
          mode: "tube",
          line: "Jubilee line",
          lineColor: "#A0A5A9",
          from: "Canary Wharf",
          to: "Bond Street",
          durationMinutes: 24,
        },
        {
          mode: "walking",
          line: "Walk",
          lineColor: "#9E9E9E",
          from: "Bond Street",
          to: "Sabor, Mayfair",
          durationMinutes: 6,
        },
      ],
    },
  },
  {
    id: "padella-shoreditch",
    hygieneRating: null,
    whyThis: "You rated it before; order the pici cacio e pepe again.",
    name: "Padella",
    type: "Italian (pasta)",
    neighbourhood: "Shoreditch, London",
    priceTier: "££",
    overview: {
      rating: 4.6,
      reviewCount: 3400,
      address: "350 Old St, London EC1V 9NQ",
      openStatus: "Open now · closes 22:00",
      reviewQuotes: [
        { text: "Best pappardelle in London, no question.", sentiment: "positive" },
        { text: "No bookings — the queue is real.", sentiment: "negative" },
      ],
    },
    menu: {
      items: [
        { name: "Pappardelle, 8-hour beef shin ragù", price: "£11.50", matchesTaste: true },
        { name: "Pici cacio e pepe", price: "£7.50", matchesTaste: true },
        { name: "Tiramisu", price: "£6", matchesTaste: false },
      ],
    },
    tasteFit: {
      score: 6.0,
      reasoning:
        "Rich ragù pastas are squarely in your high-rated range, but you've logged Padella before and marked the noise level down.",
      misses: ["Loud at peak times — logged as a factor in your Mar 2026 visit"],
    },
    journey: {
      totalMinutes: 22,
      legs: [
        {
          mode: "dlr",
          line: "DLR",
          lineColor: "#00A4A7",
          from: "Canary Wharf",
          to: "Shadwell",
          durationMinutes: 12,
        },
        {
          mode: "overground",
          line: "London Overground",
          lineColor: "#EE7C0E",
          from: "Shadwell",
          to: "Shoreditch High Street",
          durationMinutes: 6,
        },
        {
          mode: "walking",
          line: "Walk",
          lineColor: "#9E9E9E",
          from: "Shoreditch High Street",
          to: "Padella, Shoreditch",
          durationMinutes: 4,
        },
      ],
    },
    alreadyRated: {
      avgRating: 6.8,
      notes: "Visited Mar 2026 — excellent pasta, deducted for noise and the no-bookings queue.",
    },
  },
  {
    id: "dishoom-canary-wharf",
    hygieneRating: 5,
    name: "Dishoom",
    type: "Indian (Bombay café)",
    neighbourhood: "Canary Wharf, London",
    priceTier: "££",
    overview: {
      rating: 4.5,
      reviewCount: 5200,
      address: "Wood Wharf, Canary Wharf, London E14",
      openStatus: "Open now · closes 23:00",
      reviewQuotes: [
        { text: "Bacon naan roll for breakfast is unmatched.", sentiment: "positive" },
        { text: "Gets loud and busy at lunch — go early.", sentiment: "negative" },
      ],
    },
    menu: {
      items: [
        { name: "House black daal", price: "£8.90", matchesTaste: true },
        { name: "Chicken ruby", price: "£15.90", matchesTaste: true },
        { name: "Bacon naan roll", price: "£7.90", matchesTaste: true },
      ],
    },
    tasteFit: {
      score: 8.0,
      reasoning:
        "Rich, spiced slow-cooked dishes like the black daal match your consistently high-rated comfort food logs.",
      misses: [],
    },
    journey: {
      totalMinutes: 5,
      legs: [
        {
          mode: "walking",
          line: "Walk",
          lineColor: "#9E9E9E",
          from: "Canary Wharf (One Canada Square)",
          to: "Dishoom, Wood Wharf",
          durationMinutes: 5,
        },
      ],
    },
  },
  {
    id: "kbox-city",
    enriching: true,
    name: "K-BOX",
    type: "Korean BBQ",
    neighbourhood: "City of London",
    priceTier: "£££",
    overview: {
      rating: 4.3,
      reviewCount: 12,
      address: "12 Eastcheap, London EC3M 1AJ",
      openStatus: "Open now · closes 22:30",
      reviewQuotes: [],
    },
    menu: {
      items: [
        { name: "Wagyu bulgogi set", price: "£38", matchesTaste: true },
        { name: "Kimchi jjigae", price: "£14", matchesTaste: true },
        { name: "Soju flight", price: "£22", matchesTaste: false },
      ],
    },
    tasteFit: {
      score: 6.5,
      reasoning:
        "Too new to have a direct comparison, but marinated grilled meat sits close to the rich, savoury dishes you've rated well elsewhere.",
      misses: [],
    },
    journey: {
      totalMinutes: 15,
      legs: [
        {
          mode: "dlr",
          line: "DLR",
          lineColor: "#00A4A7",
          from: "Canary Wharf",
          to: "Bank",
          durationMinutes: 10,
        },
        {
          mode: "walking",
          line: "Walk",
          lineColor: "#9E9E9E",
          from: "Bank",
          to: "K-BOX, Eastcheap",
          durationMinutes: 5,
        },
      ],
    },
  },
];
