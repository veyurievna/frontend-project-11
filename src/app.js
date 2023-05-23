import onChange from 'on-change';
import * as yup from 'yup';
import axios from 'axios';
import i18next from 'i18next';
import { uniqueId } from 'lodash';
import render from './render.js';
import resources from './locales';

const validateLink = (validatedLinks) => yup.string()
  .required()
  .url()
  .notOneOf(validatedLinks);

const getData = (url) => {
  const proxyUrl = new URL('/get', 'https://allorigins.hexlet.app');
  proxyUrl.searchParams.append('disableCache', 'true');
  proxyUrl.searchParams.append('url', url);
  return axios.get(proxyUrl)
    .then((response) => response.data.contents);
};

const addIds = (posts, feedId) => {
  return posts.map((post) => ({
    ...post,
    id: uniqueId(),
    feedId,
  }));
};

const handleData = (data, watchedState) => {
  const { feed, posts } = data;
  const newFeed = {
    ...feed,
    id: uniqueId(),
  };
  const newPosts = addIds(posts, newFeed.id);
  watchedState.feeds.push(newFeed);
  watchedState.posts.push(...newPosts);
};

const updatePosts = (watchedState) => {
  const promises = watchedState.feeds.map((feed) => {
    const lastPost = watchedState.posts.find((post) => post.feedId === feed.id);
    const url = lastPost ? `${feed.link}&after=${lastPost.pubDate.toISOString()}` : feed.link;
    return getData(url)
      .then((data) => {
        const { posts } = parse(data, feed.link);
        const displayedPostLinks = watchedState.posts.map((post) => post.link);
        const newPosts = addIds(posts.filter((post) => !displayedPostLinks.includes(post.link)), feed.id);
        watchedState.posts.unshift(...newPosts);
      })
      .catch((error) => {
        console.error(error);
      });
  });

  return Promise.allSettled(promises)
    .then(() => setTimeout(updatePosts, 5000, watchedState));
};

const handleError = (error) => {
  if (error.isParsingError) {
    return 'notRss';
  }

  if (axios.isAxiosError(error)) {
    return 'networkError';
  }

  return error.message.key ?? 'unknown';
};

function app() {
  const state = {
    formState: 'filling',
    error: null,
    feeds: [],
    posts: [],
    uiState: {
      displayedPostId: null,
      viewedPostIds: new Set(),
    },
  };

  const elements = {
    form: document.querySelector('.rss-form'),
    urlInput: document.querySelector('#url-input'),
    submit: document.querySelector('[type="submit"]'),
    feedback: document.querySelector('.feedback'),
    postsList: document.querySelector('.posts'),
    feedsList: document.querySelector('.feeds'),
    modalHeader: document.querySelector('.modal-header'),
    modalBody: document.querySelector('.modal-body'),
    modalHref: document.querySelector('.full-article'),
  };

  const i18nextInstance = i18next.createInstance({ lng: 'ru', debug: false, resources });
  i18nextInstance.init()
    .then(() => {
      const watchedState = onChange(state, render(state, elements, i18nextInstance));

      const handleFormSubmit = () => {
        const input = elements.urlInput.value.trim();
        const validatedLinks = watchedState.feeds.map((feed) => feed.link);
        const schema = validateLink(validatedLinks);
        schema.validate(input)
          .then(() => {
            watchedState.error = null;
            watchedState.formState = 'sending';
            return getData(input);
          })
          .then((data) => {
            handleData(parse(data, input), watchedState);
            watchedState.formState = 'added';
          })
          .catch((error) => {
            watchedState.formState = 'invalid';
            watchedState.error = handleError(error);
          });
      };

      elements.form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleFormSubmit();
      });
    });

  elements.postsList.addEventListener('click', (event) => {
    const post = watchedState.posts.find((p) => p.id === event.target.dataset.id);
    if (!post) {
      return;
    }
    watchedState.uiState.viewedPostIds.add(post.id);
    watchedState.uiState.displayedPostId = post.id;
  });

  updatePosts(state);
};

export default app;
