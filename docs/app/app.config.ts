// https://ui.nuxt.com/theme?doc=jZJLbsMgEECvUs2qlXCFm7ipWXZRVZW66gmwPbFRMER8rKYRd68gqX_KojsYHo-ZYc4woLFCK2A5gVpLbSywMxyN6Lk5AQNtuGoRCFistWouQd5XaICAQu8Ml8DAOq0QAgHDG-EtMPq42RUE9lq5KLRcWWDwJlpnMOp6rTQw-ED3arhQ9u4zBghIofAdRds5YPnjJhCw7iQxOhrccy9dSnDgRnB1WQt19HEF1ldORnnlndPpwesdIHDkCuWMimbxgwtmasAtw_jOX9khEHD6gOqr4w2me1nmRVa1mVADGodNypubA7AnSmN1qbCS0kAurMNvt6CvSDESlTYNmhvGGdJO0XIeznq_1OYxiytI5yBKHPg_WV7XqJbsZmJflsXNoHKC8lUHOtF2iVpYy2K8MFU1zuaIbSfv88rbiL5fKLcrYN2gtSDO9fx8R2kY_93ODs7TV8TpvE-7NFDZdV6ygj5ACOEX
export default defineAppConfig({
  header: {
    title: "Tenon CMS",
    logo: {
      // Copies of `tenon-logo-full.svg` with a fixed fill: neutral-900 and neutral-50.
      light: "/logo/tenon-logo-light.svg",
      dark: "/logo/tenon-logo-dark.svg",
      alt: "Tenon CMS",
      class: "h-4!",
      favicon: "/favicon.svg",
    },
  },
  seo: {
    title: "Tenon CMS",
    description:
      "A CMS that lives inside your Vite-based app: same repo, same deploy, no second service.",
  },
  github: {
    url: "https://github.com/SuddenDev/TenonCMS",
    branch: "main",
    rootDir: "docs",
  },
  // Docs, Guide and CLI are sections: the sidebar shows the pages of the current one.
  navigation: {
    sub: "aside",
  },
  ui: {
    colors: {
      primary: "orange",
      secondary: "amber",
      neutral: "stone",
    },
    // Icons for code group labels that Nuxt UI does not know.
    prose: {
      codeIcon: {
        astro: "i-vscode-icons-file-type-astro",
        "tanstack start": "i-simple-icons-tanstack",
      },
    },
    // The sidebar has no guide line, no marker on the active page and no indent for child pages.
    contentNavigation: {
      slots: {
        // listWithChildren: "ms-1 border-s-0",
        listWithChildren: "ms-0 border-s-0",
      },
      variants: {
        level: {
          false: {
            itemWithChildren: "mb-6 data-[state=open]:mb-6",
            // itemWithChildren: "mb-3 border-b border-default pb-3 last:mb-0 last:border-b-0 data-[state=open]:mb-3",
          },
          true: {
            item: "ms-0 ps-0",
            itemWithChildren: "ms-0 ps-0",
          },
        },
      },
      defaultVariants: {
        highlight: false,
      },
    },
    // The page frame: header, main and footer share one centered column with soft side lines.
    main: {
      base: "mx-auto w-full max-w-(--ui-container) border-x border-default",
    },
    header: {
      slots: {
        root: "border-b-0 bg-default transition-colors",
        container: "border-x border-b border-default transition-colors",
        // Left and right take their own width, so the search sits next to the icons.
        left: "lg:flex-none",
        right: "lg:flex-none",
      },
    },
    pageHero: {
      slots: {
        title: "font-medium tracking-tighter sm:text-6xl",
        description: "sm:text-lg/7",
      },
    },
    pageHeader: {
      slots: {
        root: "max-w-[44rem] mx-auto sm:mt-2",
        title: "font-medium",
      },
    },
    pageBody: {
      base: "max-w-[44rem] mx-auto",
    },
    pageSection: {
      slots: {
        title: "font-medium lg:text-4xl",
      },
      variants: {
        headline: {
          true: {
            headline: "font-mono text-xs font-normal uppercase tracking-widest text-muted",
          },
        },
      },
    },
    // On the landing page a card is one cell of the grid, so its padding is the cell padding.
    pageCard: {
      slots: {
        root: "rounded-none",
        container: "px-6 py-12 sm:px-10 sm:py-16",
        title: "font-heading text-xl font-medium",
        description: "mt-2 text-base text-muted",
        footer: "pt-10",
      },
    },
    pageCTA: {
      slots: {
        title: "font-medium",
      },
    },
    pageFeature: {
      slots: {
        title: "font-medium",
      },
    },
    card: {
      defaultVariants: {
        variant: "subtle",
      },
    },
    alert: {
      defaultVariants: {
        variant: "subtle",
      },
    },
    empty: {
      defaultVariants: {
        variant: "subtle",
      },
    },
    input: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    select: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    textarea: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    selectMenu: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    inputMenu: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    inputNumber: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    inputTags: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    inputDate: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    inputTime: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
    pinInput: {
      defaultVariants: {
        variant: "subtle",
        color: "neutral",
      },
    },
  },
});
