// GENERATED DATA — do not hand-edit. Regenerate from the EUFIC endpoint below.
//
// Source (Content Authenticity Mandate):
//   EUFIC — European Food Information Council
//   Page:     https://www.eufic.org/en/explore-seasonal-fruit-and-vegetables-in-europe
//   Endpoint: https://www.eufic.org/en/global/ajax-map  (var fvlist = {Fruit, Vegetable})
//   Extracted: 2026-06-12 (curl, full dump)
//
// Item names are VERBATIM EUFIC strings (lowercase, incl. "(stored)" variants —
// Belgium/Netherlands mark stored local produce; stored ≠ imported).
// Verification: spot-checked sample cells (GR June/Dec, NL June/Dec) match this
// extraction exactly.

export const EUFIC_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];

// EUFIC groups months into seasons meteorologically (their map.js `seasons` object):
// Spring = Mar-May, Summer = Jun-Aug, Autumn = Sep-Nov, Winter = Dec-Feb.
export const EUFIC_SEASON_MONTHS = {
  spring: ['march', 'april', 'may'],
  summer: ['june', 'july', 'august'],
  autumn: ['september', 'october', 'november'],
  winter: ['december', 'january', 'february'],
};

export const EUFIC_SEASONAL = {
  greece: {
    january: {
      fruit: ['apple', 'grapefruit', 'kiwi', 'lemon', 'orange', 'tangerine'],
      vegetable: ['broad bean', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'leek', 'lettuce', 'radish', 'spinach'],
    },
    february: {
      fruit: ['grapefruit', 'kiwi', 'lemon', 'orange', 'tangerine'],
      vegetable: ['artichoke', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'leek', 'lettuce', 'radish', 'spinach'],
    },
    march: {
      fruit: ['grapefruit', 'lemon', 'orange', 'tangerine'],
      vegetable: ['artichoke', 'beetroot', 'broccoli', 'brussels sprout', 'cabbage', 'cauliflower', 'lettuce'],
    },
    april: {
      fruit: ['lemon', 'orange', 'tangerine'],
      vegetable: ['asparagus', 'beetroot', 'broad bean', 'lettuce', 'mushroom', 'radish', 'spinach'],
    },
    may: {
      fruit: ['apricot', 'cherry', 'orange', 'strawberry'],
      vegetable: ['asparagus', 'beetroot', 'courgette', 'cucumber', 'green bean', 'lettuce', 'mushroom', 'onion', 'pea', 'radish', 'spinach'],
    },
    june: {
      fruit: ['apricot', 'cherry', 'melon', 'peach', 'pear', 'plum', 'strawberry', 'watermelon'],
      vegetable: ['aubergine', 'bell pepper', 'carrot', 'courgette', 'cucumber', 'green bean', 'melon', 'pea', 'tomato', 'watermelon'],
    },
    july: {
      fruit: ['apricot', 'cherry', 'fig', 'melon', 'peach', 'pear', 'plum', 'raspberry', 'strawberry', 'watermelon'],
      vegetable: ['aubergine', 'beetroot', 'bell pepper', 'carrot', 'courgette', 'cucumber', 'green bean', 'melon', 'okra', 'potato', 'tomato', 'watermelon'],
    },
    august: {
      fruit: ['fig', 'grape', 'melon', 'peach', 'pear', 'plum', 'raspberry', 'watermelon'],
      vegetable: ['aubergine', 'bell pepper', 'carrot', 'courgette', 'cucumber', 'grape', 'green bean', 'melon', 'okra', 'potato', 'pumpkin', 'tomato', 'watermelon'],
    },
    september: {
      fruit: ['apple', 'fig', 'grape', 'melon', 'pear', 'plum', 'pomegranate', 'quince', 'raspberry', 'watermelon'],
      vegetable: ['bell pepper', 'carrot', 'courgette', 'cucumber', 'grape', 'green bean', 'leek', 'lettuce', 'melon', 'okra', 'onion', 'potato', 'spinach', 'tomato', 'watermelon'],
    },
    october: {
      fruit: ['apple', 'grape', 'lemon', 'pomegranate', 'quince', 'tangerine'],
      vegetable: ['beetroot', 'broccoli', 'cabbage', 'carrot', 'cauliflower', 'grape', 'leek', 'lettuce', 'mushroom', 'potato', 'pumpkin', 'rucola', 'spinach'],
    },
    november: {
      fruit: ['apple', 'grapefruit', 'kiwi', 'lemon', 'orange', 'pear', 'pomegranate', 'tangerine'],
      vegetable: ['beetroot', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'chard', 'leek', 'lettuce', 'mushroom', 'potato', 'spinach'],
    },
    december: {
      fruit: ['apple', 'grapefruit', 'kiwi', 'lemon', 'orange', 'pear', 'tangerine'],
      vegetable: ['beetroot', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'chard', 'leek', 'lettuce', 'potato', 'spinach'],
    },
  },
  belgium: {
    january: {
      fruit: ['apple (stored)', 'pear (stored)'],
      vegetable: ['beetroot (stored)', 'black radish (stored)', 'brussels sprout', 'cabbage', 'cabbage (stored)', 'carrot (stored)', 'celeriac (stored)', 'celery', 'chicory', 'cress', 'endive', 'fennel', 'friseline', 'jerusalem artichoke', 'kale', 'kohlrabi (stored)', 'leek', 'lettuce', 'mushroom', 'onion (stored)', 'oyster mushroom', 'parsnip', 'potato (stored)', 'pumpkin (stored)', 'red cabbage (stored)', 'rutabaga (stored)', 'salsify', 'savoy cabbage', 'shallot', 'shiitake mushroom', 'spring onion', 'turnip (stored)', 'watercress'],
    },
    february: {
      fruit: ['apple (stored)', 'pear (stored)'],
      vegetable: ['beetroot (stored)', 'black radish (stored)', 'broccolini', 'brussels sprout', 'cabbage', 'carrot (stored)', 'celeriac', 'celery', 'chicory', 'cress', 'friseline', 'jerusalem artichoke', 'kale', 'kohlrabi (stored)', 'leek', 'mushroom', 'onion (stored)', 'oyster mushroom', 'parsnip', 'potato (stored)', 'pumpkin (stored)', 'radish', 'red cabbage (stored)', 'rutabaga (stored)', 'salsify', 'savoy cabbage', 'shiitake mushroom', 'spring onion', 'turnip (stored)', 'watercress'],
    },
    march: {
      fruit: ['apple (stored)', 'pear (stored)', 'strawberry'],
      vegetable: ['asparagus', 'beetroot (stored)', 'black radish (stored)', 'broccolini', 'brussels sprout', 'cabbage (stored)', 'carrot (stored)', 'celeriac', 'chicory', 'cress', 'cucumber', 'endive', 'friseline', 'green bean', 'jerusalem artichoke', 'kale', 'leek', 'mushroom', 'onion', 'onion (stored)', 'oxheart cabbage', 'parsnip', 'potato (stored)', 'pumpkin (stored)', 'radish', 'red cabbage (stored)', 'rutabaga (stored)', 'salsify', 'savoy cabbage', 'spring onion', 'turnip (stored)', 'watercress'],
    },
    april: {
      fruit: ['apple', 'pear', 'strawberry'],
      vegetable: ['asparagus', 'aubergine', 'beetroot', 'bell pepper', 'broccolini', 'cabbage', 'celeriac', 'chicory', 'cress', 'curly endive', 'friseline', 'leek', 'lettuce', 'mushroom', 'onion', 'oyster mushroom', 'parsnip', 'radish', 'red cabbage', 'rhubarb', 'shiitake mushroom', 'spinach', 'spring onion', 'tomato', 'turnip', 'watercress'],
    },
    may: {
      fruit: ['apple', 'pear', 'strawberry'],
      vegetable: ['asparagus', 'aubergine', 'bell pepper', 'broccolini', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'celery', 'chicory', 'courgette', 'cress', 'cucumber', 'endive', 'fennel', 'friseline', 'green bean', 'leek', 'lettuce', 'mushroom', 'onion', 'oxheart cabbage', 'pak choi', 'radish', 'rhubarb', 'shiitake mushroom', 'spinach', 'tomato', 'watercress'],
    },
    june: {
      fruit: ['apple', 'blackberry', 'blackcurrant', 'blueberry', 'cherry', 'pear', 'raspberry', 'red berry', 'strawberry'],
      vegetable: ['artichoke', 'asparagus', 'broccoli', 'broccolini', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'chicory', 'chinese cabbage', 'courgette', 'cress', 'cucumber', 'curly endive', 'endive', 'fennel', 'friseline', 'green bean', 'kohlrabi', 'leek', 'lettuce', 'mushroom', 'onion', 'oxheart cabbage', 'oyster mushroom', 'pea', 'pickle', 'potato', 'radicchio', 'radish', 'rhubarb', 'shallot', 'spinach', 'spring onion', 'turnip', 'watercress'],
    },
    july: {
      fruit: ['blackberry', 'blackcurrant', 'blueberry', 'cherry', 'plum', 'raspberry', 'strawberry'],
      vegetable: ['artichoke', 'asparagus', 'aubergine', 'bell pepper', 'broccoli', 'broccolini', 'carrot', 'cauliflower', 'celeriac', 'celery', 'chicory', 'chinese cabbage', 'courgette', 'cucumber', 'curly endive', 'endive', 'fennel', 'friseline', 'green bean', 'kohlrabi', 'leek', 'lettuce', 'mushroom', 'onion', 'oyster mushroom', 'pak choi', 'pea', 'pickle', 'potato', 'radicchio', 'radish', 'rhubarb', 'spinach', 'spring onion', 'tomato', 'watercress'],
    },
    august: {
      fruit: ['apple', 'blackberry', 'blackcurrant', 'blueberry', 'gooseberry', 'pear', 'plum', 'raspberry', 'red berry', 'strawberry'],
      vegetable: ['artichoke', 'aubergine', 'beetroot', 'bell pepper', 'broccoli', 'broccolini', 'cabbage', 'carrot', 'celery', 'chicory', 'chinese cabbage', 'courgette', 'cucumber', 'curly endive', 'endive', 'fennel', 'friseline', 'green bean', 'kale', 'kohlrabi', 'lettuce', 'mushroom', 'onion', 'oyster mushroom', 'pak choi', 'pickle', 'potato', 'pumpkin', 'radicchio', 'radish', 'rutabaga', 'savoy cabbage', 'spinach', 'spring onion', 'sweet corn', 'tomato', 'watercress'],
    },
    september: {
      fruit: ['apple', 'blackberry', 'blueberry', 'pear', 'plum', 'quince', 'raspberry', 'red berry', 'strawberry'],
      vegetable: ['artichoke', 'aubergine', 'beetroot', 'bell pepper', 'black radish', 'broccoli', 'broccolini', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'celery', 'chicory', 'chinese cabbage', 'courgette', 'cucumber', 'curly endive', 'endive', 'fennel', 'friseline', 'green bean', 'kohlrabi', 'leek', 'lettuce', 'mushroom', 'onion (stored)', 'oxheart cabbage', 'oyster mushroom', 'pak choi', 'parsnip', 'pickle', 'potato', 'pumpkin', 'radicchio', 'radish', 'red cabbage', 'rutabaga', 'salsify', 'savoy cabbage', 'shiitake mushroom', 'spinach', 'spring onion', 'sweet corn', 'tomato', 'turnip', 'watercress'],
    },
    october: {
      fruit: ['apple', 'blackberry', 'blueberry', 'cranberry', 'pear', 'quince', 'raspberry', 'strawberry'],
      vegetable: ['artichoke', 'aubergine', 'beetroot', 'bell pepper', 'black radish', 'broccoli', 'broccolini', 'brussels sprout', 'cabbage', 'carrot', 'celeriac', 'celery', 'chicory', 'chinese cabbage', 'courgette', 'curly endive', 'endive', 'fennel', 'friseline', 'green bean', 'kale', 'kohlrabi', 'leek', 'lettuce', 'mushroom', 'onion (stored)', 'oxheart cabbage', 'oyster mushroom', 'pak choi', 'parsnip', 'pickle', 'potato', 'pumpkin', 'radicchio', 'radish', 'red cabbage', 'rutabaga', 'salsify', 'savoy cabbage', 'shiitake mushroom', 'spinach', 'spring onion', 'sweet corn', 'tomato', 'turnip', 'watercress'],
    },
    november: {
      fruit: ['apple (stored)', 'blackberry', 'cranberry', 'pear (stored)', 'quince', 'strawberry'],
      vegetable: ['artichoke', 'beetroot', 'black radish', 'broccolini', 'brussels sprout', 'cabbage', 'carrot', 'celeriac', 'celery', 'chicory', 'chinese cabbage', 'courgette', 'cress', 'curly endive', 'endive', 'friseline', 'jerusalem artichoke', 'kale', 'kohlrabi', 'leek', 'lettuce', 'mushroom', 'onion (stored)', 'oxheart cabbage', 'oyster mushroom', 'pak choi', 'parsnip', 'potato', 'pumpkin (stored)', 'radicchio', 'radish', 'red cabbage', 'rutabaga', 'salsify', 'savoy cabbage', 'shiitake mushroom', 'spinach', 'spring onion', 'turnip', 'watercress'],
    },
    december: {
      fruit: ['apple (stored)', 'cranberry', 'pear (stored)', 'quince'],
      vegetable: ['beetroot (stored)', 'black radish (stored)', 'broccoli', 'brussels sprout', 'cabbage', 'carrot (stored)', 'celeriac', 'chicory', 'chinese cabbage', 'cress', 'curly endive', 'endive', 'friseline', 'jerusalem artichoke', 'kale', 'kohlrabi (stored)', 'leek', 'mushroom', 'onion (stored)', 'oyster mushroom', 'pak choi', 'parsnip', 'potato (stored)', 'pumpkin (stored)', 'red cabbage', 'rutabaga (stored)', 'salsify', 'savoy cabbage', 'shallot', 'shiitake mushroom', 'spring onion', 'turnip (stored)', 'watercress'],
    },
  },
  netherlands: {
    january: {
      fruit: ['apple (stored)', 'pear'],
      vegetable: ['beetroot', 'black radish', 'brussels sprout', 'carrot', 'celeriac', 'chicory', 'chinese cabbage', 'jerusalem artichoke', 'kale', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'parsnip', 'pumpkin', 'radish', 'red cabbage', 'rhubarb', 'salsify', 'savoy cabbage', 'swede'],
    },
    february: {
      fruit: ['apple (stored)', 'pear'],
      vegetable: ['beetroot', 'black radish', 'brussels sprout', 'carrot', 'celeriac', 'chicory', 'chinese cabbage', 'jerusalem artichoke', 'kale', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'parsnip', 'pumpkin', 'radish', 'red cabbage', 'rhubarb', 'salsify', 'savoy cabbage', 'swede'],
    },
    march: {
      fruit: ['apple (stored)', 'pear'],
      vegetable: ['beetroot', 'black radish', 'brussels sprout', 'carrot', 'celeriac', 'chicory', 'chinese cabbage', 'jerusalem artichoke', 'kale', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'parsnip', 'pumpkin', 'radish', 'red cabbage', 'rhubarb', 'salsify', 'savoy cabbage', 'swede'],
    },
    april: {
      fruit: ['apple', 'pear'],
      vegetable: ['asparagus', 'beetroot', 'broad bean', 'cabbage', 'carrot', 'chicory', 'chinese cabbage', 'cucumber', 'lamb\'s lettuce', 'leek', 'onion', 'pak choi', 'pumpkin', 'radish', 'red cabbage', 'rhubarb', 'salsify', 'samphire', 'tomato', 'turnip'],
    },
    may: {
      fruit: ['apple', 'cherry', 'pear', 'strawberry'],
      vegetable: ['asparagus', 'beetroot', 'broad bean', 'cabbage', 'carrot', 'chicory', 'chinese cabbage', 'cucumber', 'lamb\'s lettuce', 'leek', 'onion', 'pak choi', 'pumpkin', 'radish', 'red cabbage', 'rhubarb', 'salsify', 'samphire', 'tomato', 'turnip'],
    },
    june: {
      fruit: ['cherry', 'strawberry'],
      vegetable: ['asparagus', 'beetroot', 'broad bean', 'cabbage', 'carrot', 'chicory', 'chinese cabbage', 'cucumber', 'lamb\'s lettuce', 'leek', 'onion', 'pak choi', 'pumpkin', 'radish', 'red cabbage', 'rhubarb', 'salsify', 'samphire', 'tomato', 'turnip'],
    },
    july: {
      fruit: ['cherry', 'strawberry'],
      vegetable: ['beetroot', 'broad bean', 'broccoli', 'carrot', 'cauliflower', 'celery', 'chinese cabbage', 'courgette', 'cucumber', 'endive', 'fennel', 'green bean', 'iceberg lettuce', 'kohlrabi', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'pak choi', 'pea', 'radicchio', 'radish', 'red cabbage', 'rhubarb', 'rucola', 'samphire', 'savoy cabbage', 'snow pea', 'spinach', 'spring onion', 'sweet corn', 'tomato', 'turnip'],
    },
    august: {
      fruit: ['cherry', 'strawberry'],
      vegetable: ['beetroot', 'broad bean', 'broccoli', 'carrot', 'cauliflower', 'celery', 'chinese cabbage', 'courgette', 'cucumber', 'endive', 'fennel', 'green bean', 'iceberg lettuce', 'kohlrabi', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'pak choi', 'pea', 'radicchio', 'radish', 'red cabbage', 'rhubarb', 'rucola', 'samphire', 'savoy cabbage', 'snow pea', 'spinach', 'spring onion', 'sweet corn', 'tomato', 'turnip'],
    },
    september: {
      fruit: ['apple', 'pear'],
      vegetable: ['beetroot', 'broad bean', 'broccoli', 'carrot', 'cauliflower', 'celery', 'chinese cabbage', 'courgette', 'cucumber', 'endive', 'fennel', 'green bean', 'iceberg lettuce', 'kohlrabi', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'pak choi', 'pea', 'radicchio', 'radish', 'red cabbage', 'rhubarb', 'rucola', 'samphire', 'savoy cabbage', 'snow pea', 'spinach', 'spring onion', 'sweet corn', 'tomato', 'turnip'],
    },
    october: {
      fruit: ['apple', 'pear'],
      vegetable: ['beetroot', 'black radish', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'chicory', 'chinese cabbage', 'endive', 'fennel', 'haricot bean', 'iceberg lettuce', 'jerusalem artichoke', 'kale', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'pak choi', 'parsnip', 'pumpkin', 'radicchio', 'radish', 'red cabbage', 'rhubarb', 'rucola', 'salsify', 'savoy cabbage', 'snow pea', 'spring onion', 'swede', 'tomato', 'turnip'],
    },
    november: {
      fruit: ['apple', 'pear'],
      vegetable: ['beetroot', 'black radish', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'chicory', 'chinese cabbage', 'endive', 'fennel', 'haricot bean', 'iceberg lettuce', 'jerusalem artichoke', 'kale', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'pak choi', 'parsnip', 'pumpkin', 'radicchio', 'radish', 'red cabbage', 'rhubarb', 'rucola', 'salsify', 'savoy cabbage', 'snow pea', 'spring onion', 'swede', 'tomato', 'turnip'],
    },
    december: {
      fruit: ['apple', 'pear'],
      vegetable: ['beetroot', 'black radish', 'broccoli', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'chicory', 'chinese cabbage', 'endive', 'fennel', 'haricot bean', 'iceberg lettuce', 'jerusalem artichoke', 'kale', 'lamb\'s lettuce', 'leek', 'onion', 'oxheart cabbage', 'pak choi', 'parsnip', 'pumpkin', 'radicchio', 'radish', 'red cabbage', 'rhubarb', 'rucola', 'salsify', 'savoy cabbage', 'snow pea', 'spring onion', 'swede', 'tomato', 'turnip'],
    },
  },
  portugal: {
    january: {
      fruit: ['apple', 'banana', 'blackberry', 'kiwi', 'lemon', 'orange', 'pear', 'pineapple', 'tangerine'],
      vegetable: ['beetroot', 'broccoli', 'brussels sprout', 'carrot', 'cauliflower', 'celery', 'chard', 'chicory', 'cress', 'endive', 'fennel', 'kale', 'leek', 'lettuce', 'onion', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
    february: {
      fruit: ['apple', 'banana', 'blackberry', 'kiwi', 'lemon', 'orange', 'pear', 'pineapple', 'tangerine'],
      vegetable: ['asparagus', 'beetroot', 'broccoli', 'brussels sprout', 'carrot', 'cauliflower', 'celery', 'chard', 'cress', 'endive', 'fennel', 'kale', 'lettuce', 'onion', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
    march: {
      fruit: ['apple', 'banana', 'blackberry', 'kiwi', 'lemon', 'medlar', 'orange', 'pear', 'pineapple'],
      vegetable: ['asparagus', 'beetroot', 'broccoli', 'brussels sprout', 'carrot', 'cauliflower', 'celery', 'chard', 'cress', 'endive', 'fennel', 'kale', 'lettuce', 'onion', 'pea', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
    april: {
      fruit: ['apple', 'banana', 'blackberry', 'lemon', 'medlar', 'orange', 'pineapple', 'strawberry', 'tangerine'],
      vegetable: ['artichoke', 'asparagus', 'beetroot', 'broad bean', 'broccoli', 'brussels sprout', 'carrot', 'celery', 'chard', 'cress', 'fennel', 'kale', 'lettuce', 'onion', 'pea', 'potato', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
    may: {
      fruit: ['apricot', 'banana', 'blackberry', 'blueberry', 'cherry', 'lemon', 'medlar', 'orange', 'pineapple', 'strawberry'],
      vegetable: ['artichoke', 'beetroot', 'broad bean', 'broccoli', 'brussels sprout', 'carrot', 'celery', 'chard', 'courgette', 'cress', 'cucumber', 'fennel', 'kale', 'lettuce', 'onion', 'pea', 'potato', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
    june: {
      fruit: ['apricot', 'banana', 'blackberry', 'blueberry', 'cherry', 'fig', 'grape', 'lemon', 'melon', 'peach', 'pear', 'pineapple', 'plum', 'raspberry', 'strawberry'],
      vegetable: ['artichoke', 'aubergine', 'beetroot', 'bell pepper', 'broccoli', 'carrot', 'celery', 'chard', 'chayote', 'chinese cabbage', 'courgette', 'cucumber', 'grape', 'green bean', 'leek', 'lettuce', 'melon', 'onion', 'potato', 'radish', 'sweet corn', 'tomato'],
    },
    july: {
      fruit: ['apple', 'apricot', 'banana', 'blackberry', 'blueberry', 'cherry', 'fig', 'grape', 'lemon', 'melon', 'peach', 'pear', 'pineapple', 'plum', 'raspberry', 'strawberry', 'watermelon'],
      vegetable: ['aubergine', 'bell pepper', 'carrot', 'chayote', 'chinese cabbage', 'courgette', 'cucumber', 'grape', 'green bean', 'leek', 'melon', 'onion', 'potato', 'sweet corn', 'tomato', 'watermelon'],
    },
    august: {
      fruit: ['apple', 'banana', 'blackberry', 'blueberry', 'fig', 'grape', 'lemon', 'melon', 'peach', 'pear', 'pineapple', 'plum', 'raspberry', 'strawberry', 'watermelon'],
      vegetable: ['aubergine', 'bell pepper', 'carrot', 'chayote', 'chinese cabbage', 'courgette', 'cucumber', 'grape', 'green bean', 'leek', 'melon', 'onion', 'sweet corn', 'tomato', 'watermelon'],
    },
    september: {
      fruit: ['apple', 'banana', 'blackberry', 'fig', 'grape', 'lemon', 'melon', 'peach', 'pear', 'pineapple', 'plum', 'pomegranate', 'raspberry', 'watermelon'],
      vegetable: ['aubergine', 'bell pepper', 'carrot', 'cauliflower', 'chayote', 'chinese cabbage', 'courgette', 'cucumber', 'grape', 'green bean', 'leek', 'melon', 'onion', 'potato', 'pumpkin', 'sweet corn', 'tomato', 'watermelon'],
    },
    october: {
      fruit: ['apple', 'banana', 'blackberry', 'grape', 'lemon', 'orange', 'peach', 'pear', 'persimmon', 'pineapple', 'plum', 'pomegranate', 'tangerine'],
      vegetable: ['aubergine', 'beetroot', 'bell pepper', 'broccoli', 'brussels sprout', 'cauliflower', 'celery', 'chard', 'chayote', 'chinese cabbage', 'courgette', 'cress', 'cucumber', 'fennel', 'grape', 'kale', 'leek', 'lettuce', 'onion', 'potato', 'pumpkin', 'radish', 'spinach', 'tomato', 'turnip'],
    },
    november: {
      fruit: ['apple', 'banana', 'blackberry', 'kiwi', 'lemon', 'orange', 'pear', 'persimmon', 'pineapple', 'pomegranate', 'tangerine'],
      vegetable: ['beetroot', 'broccoli', 'brussels sprout', 'carrot', 'cauliflower', 'celery', 'chard', 'chinese cabbage', 'cress', 'cucumber', 'endive', 'fennel', 'kale', 'leek', 'lettuce', 'onion', 'potato', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
    december: {
      fruit: ['apple', 'banana', 'blackberry', 'kiwi', 'lemon', 'orange', 'pear', 'persimmon', 'pineapple', 'pomegranate', 'tangerine'],
      vegetable: ['beetroot', 'broccoli', 'brussels sprout', 'carrot', 'cauliflower', 'celery', 'chard', 'chinese cabbage', 'cress', 'endive', 'fennel', 'kale', 'leek', 'lettuce', 'onion', 'potato', 'pumpkin', 'radish', 'spinach', 'turnip'],
    },
  },
};
