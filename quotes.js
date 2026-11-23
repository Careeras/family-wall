/* Quote of the day - one per day of the year, from a quote pack.
   The wall shows CONFIG.quotePack unless the tablet sets localStorage "fw_quotes" = { "pack": "<name>" }.
   wisdom: strategy, discipline, resilience and gratitude from thinkers, leaders and builders. Classical texts use
   standard public translations (Sun Tzu: Lionel Giles; Epictetus: Long and Higginson; Seneca and Marcus Aurelius:
   common modern renderings). Lines that are widely misattributed (several "Einstein", "Churchill", "Lincoln",
   "Gandhi", "Aristotle" and "Darwin" quotes) were left out on purpose; Durant is credited for his Aristotle summary.
   No free quote service fits: none lets the wall choose the theme or vet the content, and most block browser
   pages (checked 2026-11-23). */
window.QUOTE_PACKS = {
  wisdom: {
    label: "Wisdom and strategy",
    quotes: [
      { t: "If you know the enemy and know yourself, you need not fear the result of a hundred battles.", a: "Sun Tzu" },
      { t: "The victorious strategist only seeks battle after the victory has been won.", a: "Sun Tzu" },
      { t: "Supreme excellence consists in breaking the enemy's resistance without fighting.", a: "Sun Tzu" },
      { t: "The impediment to action advances action. What stands in the way becomes the way.", a: "Marcus Aurelius" },
      { t: "Waste no more time arguing about what a good man should be. Be one.", a: "Marcus Aurelius" },
      { t: "The happiness of your life depends upon the quality of your thoughts.", a: "Marcus Aurelius" },
      { t: "We suffer more often in imagination than in reality.", a: "Seneca" },
      { t: "It is not that we have a short time to live, but that we waste a lot of it.", a: "Seneca" },
      { t: "If one does not know to which port one is sailing, no wind is favorable.", a: "Seneca" },
      { t: "Difficulties strengthen the mind, as labor does the body.", a: "Seneca" },
      { t: "Men are disturbed not by the things which happen, but by the opinions about the things.", a: "Epictetus" },
      { t: "First say to yourself what you would be; and then do what you have to do.", a: "Epictetus" },
      { t: "No man is free who is not master of himself.", a: "Epictetus" },
      { t: "He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.", a: "Epictetus" },
      { t: "A journey of a thousand miles begins with a single step.", a: "Lao Tzu" },
      { t: "Knowing others is intelligence; knowing yourself is true wisdom.", a: "Lao Tzu" },
      { t: "To know what you know and to know what you do not know, that is true knowledge.", a: "Confucius" },
      { t: "The unexamined life is not worth living.", a: "Socrates" },
      { t: "Opportunity passes like a cloud, so make use of good opportunities.", a: "Ali ibn Abi Talib" },
      { t: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", a: "Will Durant" },
      { t: "Life can only be understood backwards; but it must be lived forwards.", a: "Søren Kierkegaard" },
      { t: "When we are no longer able to change a situation, we are challenged to change ourselves.", a: "Viktor Frankl" },
      { t: "Knowing is not enough; we must apply. Willing is not enough; we must do.", a: "Johann Wolfgang von Goethe" },
      { t: "Gratitude is not only the greatest of virtues, but the parent of all the others.", a: "Cicero" },
      { t: "Lost time is never found again.", a: "Benjamin Franklin" },
      { t: "Well done is better than well said.", a: "Benjamin Franklin" },
      { t: "Plans are worthless, but planning is everything.", a: "Dwight D. Eisenhower" },
      { t: "To improve is to change; to be perfect is to change often.", a: "Winston Churchill" },
      { t: "Never give in, never give in, never, never, never.", a: "Winston Churchill" },
      { t: "Education is the most powerful weapon which you can use to change the world.", a: "Nelson Mandela" },
      { t: "There is nothing so useless as doing efficiently that which should not be done at all.", a: "Peter Drucker" },
      { t: "Efficiency is doing things right; effectiveness is doing the right things.", a: "Peter Drucker" },
      { t: "The most important thing in communication is hearing what isn't said.", a: "Peter Drucker" },
      { t: "Someone's sitting in the shade today because someone planted a tree a long time ago.", a: "Warren Buffett" },
      { t: "It takes 20 years to build a reputation and five minutes to ruin it. If you think about that, you'll do things differently.", a: "Warren Buffett" },
      { t: "Spend each day trying to be a little wiser than you were when you woke up.", a: "Charlie Munger" },
      { t: "Focusing is about saying no.", a: "Steve Jobs" },
      { t: "Stay hungry. Stay foolish.", a: "Steve Jobs" },
      { t: "Good is the enemy of great.", a: "Jim Collins" },
      { t: "The main thing is to keep the main thing the main thing.", a: "Stephen Covey" },
      { t: "Most people do not listen with the intent to understand; they listen with the intent to reply.", a: "Stephen Covey" },
      { t: "We must all suffer one of two things: the pain of discipline or the pain of regret.", a: "Jim Rohn" },
      { t: "Absorb what is useful, discard what is useless and add what is specifically your own.", a: "Bruce Lee" },
      { t: "Do nothing which is of no use.", a: "Miyamoto Musashi" },
      { t: "Strive not to be a success, but rather to be of value.", a: "Albert Einstein" },
      { t: "In the middle of difficulty lies opportunity.", a: "Albert Einstein" },
      { t: "We may encounter many defeats but we must not be defeated.", a: "Maya Angelou" },
      { t: "Alone we can do so little; together we can do so much.", a: "Helen Keller" },
      { t: "Whether you think you can, or you think you can't, you're right.", a: "Henry Ford" },
      { t: "The best way out is always through.", a: "Robert Frost" }
    ]
  }
};
