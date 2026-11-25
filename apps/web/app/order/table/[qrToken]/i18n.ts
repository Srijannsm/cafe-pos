// Tiny UI dictionary for the customer page. Item names stay exactly as the
// cafe typed them; only our labels are translated.
const en = {
  table: "Table", popular: "Popular", all: "All", soldOut: "Sold out", add: "Add", addToOrder: "Add to order",
  viewCart: "View order", items: "items", yourOrder: "Your order", placeOrder: "Place order", placing: "Sending…",
  confirmNote: "A staff member will confirm your order in a moment.", goesWell: "Goes well with",
  callWaiter: "Call waiter", requestBill: "Request bill", requested: "Staff have been notified",
  waiting: "Waiting for staff", cooking: "Being prepared", ready: "Ready", served: "Served",
  orderSent: "Order sent! A staff member will confirm it shortly.", addMore: "Add more", total: "Total",
  wifi: "Wi-Fi", copied: "Copied", search: "Search the menu", noResults: "Nothing matches that.",
  play: "Play while you wait", playHint: "Quick tic-tac-toe with your table — or challenge another table.",
  youAre: "You are", playTable: "Play my table", playTableHint: "Someone at your table joins",
  challenge: "Challenge a table", challengeHint: "Any table in the cafe can join",
  waitingOpponent: "Waiting for an opponent…", openGames: "Open games", noGames: "No open games right now.",
  yourTable: "your table", join: "Join", gameRules: "No chat — just emoji reactions. Be nice!",
  draw: "It's a draw", youWin: "You win! 🎉", youLose: "They win this one", yourTurn: "Your turn", theirTurn: "Their turn…",
  you: "You", draws: "draws", rematch: "Rematch", leave: "Leave", gameOffline: "Games are offline right now.",
  billPrinted: "Your bill is ready — please pay at the counter or ask staff.", vatIncl: "Prices include VAT",
  vatExcl: "VAT added at billing", pan: "PAN", note: "Note", remove: "Remove",
};
const ne: typeof en = {
  table: "टेबल", popular: "लोकप्रिय", all: "सबै", soldOut: "सकियो", add: "थप्नुहोस्", addToOrder: "अर्डरमा थप्नुहोस्",
  viewCart: "अर्डर हेर्नुहोस्", items: "वटा", yourOrder: "तपाईंको अर्डर", placeOrder: "अर्डर गर्नुहोस्", placing: "पठाउँदै…",
  confirmNote: "हाम्रो स्टाफले छिट्टै अर्डर पक्का गर्नुहुनेछ।", goesWell: "यससँग मिल्छ",
  callWaiter: "वेटर बोलाउनुहोस्", requestBill: "बिल माग्नुहोस्", requested: "स्टाफलाई खबर गरियो",
  waiting: "स्टाफको प्रतीक्षामा", cooking: "तयार हुँदैछ", ready: "तयार", served: "दिइयो",
  orderSent: "अर्डर पठाइयो! स्टाफले छिट्टै पक्का गर्नुहुनेछ।", addMore: "अझै थप्नुहोस्", total: "जम्मा",
  wifi: "वाइफाइ", copied: "कपी भयो", search: "मेनु खोज्नुहोस्", noResults: "केही भेटिएन।",
  play: "पर्खँदा खेल्नुहोस्", playHint: "आफ्नो टेबलसँग वा अर्को टेबलसँग टिक-ट्याक-टो।",
  youAre: "तपाईं", playTable: "मेरो टेबल", playTableHint: "तपाईंको टेबलको कोही जोडिन्छ",
  challenge: "अर्को टेबललाई चुनौती", challengeHint: "क्याफेको जुनसुकै टेबल जोडिन सक्छ",
  waitingOpponent: "प्रतिद्वन्द्वीको प्रतीक्षा…", openGames: "खुला खेलहरू", noGames: "अहिले कुनै खेल छैन।",
  yourTable: "तपाईंको टेबल", join: "जोडिनुहोस्", gameRules: "च्याट छैन — इमोजी मात्र।",
  draw: "बराबरी", youWin: "तपाईं जित्नुभयो! 🎉", youLose: "उहाँहरू जित्नुभयो", yourTurn: "तपाईंको पालो", theirTurn: "उहाँहरूको पालो…",
  you: "तपाईं", draws: "बराबरी", rematch: "फेरि खेल्नुहोस्", leave: "छोड्नुहोस्", gameOffline: "खेल अहिले बन्द छ।",
  billPrinted: "बिल तयार छ — काउन्टरमा तिर्नुहोस्।", vatIncl: "मूल्यमा भ्याट समावेश", vatExcl: "बिलमा भ्याट थपिन्छ",
  pan: "प्यान", note: "नोट", remove: "हटाउनुहोस्",
};
export const DICT = { en, ne };
export type Lang = keyof typeof DICT;
