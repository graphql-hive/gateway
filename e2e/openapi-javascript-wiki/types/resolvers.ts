import {
  FieldNode,
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
  SelectionSetNode,
} from 'graphql';
import { MeshInContextSDK } from './incontext-sdk';

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  /** The `BigInt` scalar type represents non-fractional signed whole numeric values. */
  BigInt: { input: any; output: any };
  /** The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf). */
  JSON: { input: any; output: any };
  /** A string that cannot be passed as an empty value */
  NonEmptyString: { input: any; output: any };
  ObjMap: { input: any; output: any };
  _DirectiveExtensions: { input: any; output: any };
  join__FieldSet: { input: any; output: any };
  link__Import: { input: any; output: any };
};

export enum HttpMethod {
  Connect = 'CONNECT',
  Delete = 'DELETE',
  Get = 'GET',
  Head = 'HEAD',
  Options = 'OPTIONS',
  Patch = 'PATCH',
  Post = 'POST',
  Put = 'PUT',
  Trace = 'TRACE',
}

export type Mutation = {
  __typename?: 'Mutation';
  /**
   * Checks the supplied TeX formula for correctness and returns the
   * normalised formula representation as well as information about
   * identifiers. Available types are tex and inline-tex. The response
   * contains the `x-resource-location` header which can be used to retrieve
   * the render of the checked formula in one of the supported rendering
   * formats. Just append the value of the header to `/media/math/{format}/`
   * and perform a GET request against that URL.
   *
   * Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable).
   */
  post_media_math_check_by_type?: Maybe<Scalars['JSON']['output']>;
  /**
   * Fetches the machine translation for the posted content from the source
   * to the destination language.
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  post_transform_html_from_by_from_lang_to_by_to_lang?: Maybe<Cx_Mt>;
  /**
   * Fetches the machine translation for the posted content from the source
   * to the destination language.
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  post_transform_html_from_by_from_lang_to_by_to_lang_by_provider?: Maybe<Cx_Mt>;
};

export type MutationPost_Media_Math_Check_By_TypeArgs = {
  type: MutationInput_Post_Media_Math_Check_By_Type_Type;
};

export type MutationPost_Transform_Html_From_By_From_Lang_To_By_To_LangArgs = {
  from_lang: Scalars['String']['input'];
  to_lang: Scalars['String']['input'];
};

export type MutationPost_Transform_Html_From_By_From_Lang_To_By_To_Lang_By_ProviderArgs =
  {
    from_lang: Scalars['String']['input'];
    provider: MutationInput_Post_Transform_Html_From_By_From_Lang_To_By_To_Lang_By_Provider_Provider;
    to_lang: Scalars['String']['input'];
  };

export type Query = {
  __typename?: 'Query';
  /**
   * Gets availability of featured feed content for the apps by wiki domain.
   *
   * Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   */
  feed_availability?: Maybe<Availability>;
  /**
   * Returns the previously-stored formula via `/media/math/check/{type}` for
   * the given hash.
   *
   * Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable).
   */
  media_math_formula_by_hash?: Maybe<Scalars['JSON']['output']>;
  /**
   * Given a request hash, renders a TeX formula into its mathematic
   * representation in the given format. When a request is issued to the
   * `/media/math/check/{format}` POST endpoint, the response contains the
   * `x-resource-location` header denoting the hash ID of the POST data. Once
   * obtained, this endpoint has to be used to obtain the actual render.
   *
   * Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable).
   */
  media_math_render_by_format_by_hash?: Maybe<Scalars['JSON']['output']>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of absolute bytes
   * difference sums. You can filter by editors-type (all-editor-types, anonymous, group-bot,
   * name-bot, user) and page-type (all-page-types, content, non-content). You can choose
   * between daily and monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Maybe<Absolute_Bytes_Difference>;
  /**
   * Given a Mediawiki project, a page-title prefixed with canonical namespace (for
   * instance 'User:Jimbo_Wales') and a date range, returns a timeseries of bytes
   * difference absolute sums. You can filter by editors-type (all-editor-types, anonymous,
   * group-bot, name-bot, user). You can choose between daily and monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end?: Maybe<Absolute_Bytes_Difference_Per_Page>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of bytes difference net
   * sums. You can filter by editors-type (all-editor-types, anonymous, group-bot, name-bot,
   * user) and page-type (all-page-types, content or non-content). You can choose between
   * daily and monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Maybe<Net_Bytes_Difference>;
  /**
   * Given a Mediawiki project, a page-title prefixed with canonical namespace (for
   * instance 'User:Jimbo_Wales') and a date range, returns a timeseries of bytes
   * difference net sums. You can filter by editors-type (all-editor-types, anonymous,
   * group-bot, name-bot, user). You can choose between daily and monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end?: Maybe<Net_Bytes_Difference_Per_Page>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of its edited-pages counts.
   * You can filter by editor-type (all-editor-types, anonymous, group-bot, name-bot, user),
   * page-type (all-page-types, content or non-content) or activity-level (1..4-edits,
   * 5..24-edits, 25..99-edits, 100..-edits). You can choose between daily and monthly
   * granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end?: Maybe<Edited_Pages>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of its new pages counts.
   * You can filter by editor type (all-editor-types, anonymous, group-bot, name-bot, user)
   * or page-type (all-page-types, content or non-content). You can choose between daily and
   * monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Maybe<New_Pages>;
  /**
   * Given a Mediawiki project and a date (day or month), returns a timeseries of the top 100
   * edited-pages by absolute bytes-difference. You can filter by editor-type (all-editor-types,
   * anonymous, group-bot, name-bot, user) or page-type (all-page-types, content or non-content).
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Maybe<Top_Edited_Pages_By_Abs_Bytes_Diff>;
  /**
   * Given a Mediawiki project and a date (day or month), returns a timeseries of the top
   * 100 edited-pages by edits count. You can filter by editor-type (all-editor-types,
   * anonymous, group-bot, name-bot, user) or page-type (all-page-types, content or
   * non-content).
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Maybe<Top_Edited_Pages_By_Edits>;
  /**
   * Given a Mediawiki project and a date (day or month), returns a timeseries of the top 100
   * edited-pages by net bytes-difference. You can filter by editor-type (all-editor-types,
   * anonymous, group-bot, name-bot, user) or page-type (all-page-types, content or non-content).
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Maybe<Top_Edited_Pages_By_Net_Bytes_Diff>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of its editors counts.
   * You can filter by editory-type (all-editor-types, anonymous, group-bot, name-bot, user),
   * page-type (all-page-types, content or non-content) or activity-level (1..4-edits,
   * 5..24-edits, 25..99-edits or 100..-edits). You can choose between daily and monthly
   * granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end?: Maybe<Editors>;
  /**
   * Given a Mediawiki project and a date (day or month), returns a timeseries of the top 100
   * editors by absolute bytes-difference. You can filter by editor-type (all-editor-types,
   * anonymous, group-bot, name-bot, user) or page-type (all-page-types, content or non-content).
   * The user_text returned is either the mediawiki user_text if the user is registered, or
   * null if user is anonymous.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Maybe<Top_Editors_By_Abs_Bytes_Diff>;
  /**
   * Given a Mediawiki project and a date (day or month), returns a timeseries of the top
   * 100 editors by edits count. You can filter by editor-type (all-editor-types,
   * anonymous, group-bot, name-bot, user) or page-type (all-page-types, content or
   * non-content). The user_text returned is either the mediawiki user_text if the user is
   * registered, or null if user is anonymous.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Maybe<Top_Editors_By_Edits>;
  /**
   * Given a Mediawiki project and a date (day or month), returns a timeseries of the top 100
   * editors by net bytes-difference. You can filter by editor-type (all-editor-types, anonymous,
   * group-bot, name-bot, user) or page-type (all-page-types, content or non-content). The
   * user_text returned is either the mediawiki user_text if the user is registered, or
   * "Anonymous Editor" if user is anonymous.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Maybe<Top_Editors_By_Net_Bytes_Diff>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of edits counts.
   * You can filter by editors-type (all-editor-types, anonymous, bot, registered) and
   * page-type (all-page-types, content or non-content). You can choose between daily and
   * monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Maybe<Edits>;
  /**
   * Given a Mediawiki project, a page-title prefixed with its canonical namespace (for
   * instance 'User:Jimbo_Wales') and a date range, returns a timeseries of edit counts.
   * You can filter by editors-type (all-editor-types, anonymous, group-bot, name-bot, user).
   * You can choose between daily and monthly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end?: Maybe<Edits_Per_Page>;
  /**
   * Given a project and a date range, returns a timeseries of pagecounts.
   * You can filter by access site (mobile or desktop) and you can choose between monthly,
   * daily and hourly granularity as well.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 100 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end?: Maybe<Pagecounts_Project>;
  /**
   * Given a date range, returns a timeseries of pageview counts. You can filter by project,
   * access method and/or agent type. You can choose between daily and hourly granularity
   * as well.
   *
   * - Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable)
   * - Rate limit: 100 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end?: Maybe<Pageview_Project>;
  /**
   * Given a Mediawiki article and a date range, returns a daily timeseries of its pageview
   * counts. You can also filter by access method and/or agent type.
   *
   * - Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable)
   * - Rate limit: 100 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end?: Maybe<Pageview_Article>;
  /**
   * Lists the pageviews to this project, split by country of origin for a given month.
   * Because of privacy reasons, pageviews are given in a bucketed format, and countries
   * with less than 100 views do not get reported.
   * Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 100 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month?: Maybe<By_Country>;
  /**
   * Lists the 1000 most viewed articles for a given project and timespan (month or day).
   * You can filter by access method.
   *
   * - Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable)
   * - Rate limit: 100 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day?: Maybe<Pageview_Tops>;
  /**
   * Given a Mediawiki project and a date range, returns a timeseries of its newly registered
   * users counts. You can choose between daily and monthly granularity. The newly registered
   * users value is computed with self-created users only, not auto-login created ones.
   *
   * - Stability: [experimental](https://www.mediawiki.org/wiki/API_versioning#Experimental)
   * - Rate limit: 25 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_registered_users_new_by_project_by_granularity_by_start_by_end?: Maybe<New_Registered_Users>;
  /**
   * Given a project and a date range, returns a timeseries of unique devices counts.
   * You need to specify a project, and can filter by accessed site (mobile or desktop).
   * You can choose between daily and hourly granularity as well.
   *
   * - Stability: [stable](https://www.mediawiki.org/wiki/API_versioning#Stable)
   * - Rate limit: 100 req/s
   * - License: Data accessible via this endpoint is available under the
   *   [CC0 1.0 license](https://creativecommons.org/publicdomain/zero/1.0/).
   */
  metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end?: Maybe<Unique_Devices>;
  /**
   * Fetches the list of language pairs the back-end service can translate
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_list_languagepairs?: Maybe<Cx_Languagepairs>;
  /**
   * Fetches the list of tools that are available for the given pair of languages.
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_list_pair_by_from_by_to?: Maybe<Cx_List_Tools>;
  /**
   * Fetches the list of tools and all of the language pairs it can translate
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_list_tool_by_tool?: Maybe<Scalars['JSON']['output']>;
  /**
   * Fetches the list of tools and all of the language pairs it can translate
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_list_tool_by_tool_by_from?: Maybe<Scalars['JSON']['output']>;
  /**
   * Fetches the list of tools and all of the language pairs it can translate
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_list_tool_by_tool_by_from_by_to?: Maybe<Scalars['JSON']['output']>;
  /**
   * Fetches the dictionary meaning of a word from a language and displays
   * it in the target language.
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_word_from_by_from_lang_to_by_to_lang_by_word?: Maybe<Cx_Dict>;
  /**
   * Fetches the dictionary meaning of a word from a language and displays
   * it in the target language.
   *
   * Stability: [unstable](https://www.mediawiki.org/wiki/API_versioning#Unstable)
   */
  transform_word_from_by_from_lang_to_by_to_lang_by_word_by_provider?: Maybe<Cx_Dict>;
  viewsInPastMonth: Scalars['String']['output'];
};

export type QueryMedia_Math_Formula_By_HashArgs = {
  hash: Scalars['NonEmptyString']['input'];
};

export type QueryMedia_Math_Render_By_Format_By_HashArgs = {
  format: QueryInput_Media_Math_Render_By_Format_By_Hash_Format;
  hash: Scalars['NonEmptyString']['input'];
};

export type QueryMetrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
    page_type: QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity;
    page_title: Scalars['String']['input'];
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
    page_type: QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity;
    page_title: Scalars['String']['input'];
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_EndArgs =
  {
    activity_level: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Activity_Level;
    editor_type: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Granularity;
    page_type: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Page_Type;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
    page_type: QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs =
  {
    day: Scalars['String']['input'];
    editor_type: QueryInput_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
    month: Scalars['String']['input'];
    page_type: QueryInput_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs =
  {
    day: Scalars['String']['input'];
    editor_type: QueryInput_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
    month: Scalars['String']['input'];
    page_type: QueryInput_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs =
  {
    day: Scalars['String']['input'];
    editor_type: QueryInput_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
    month: Scalars['String']['input'];
    page_type: QueryInput_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_EndArgs =
  {
    activity_level: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Activity_Level;
    editor_type: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Granularity;
    page_type: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Page_Type;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs =
  {
    day: Scalars['String']['input'];
    editor_type: QueryInput_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
    month: Scalars['String']['input'];
    page_type: QueryInput_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs =
  {
    day: Scalars['String']['input'];
    editor_type: QueryInput_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
    month: Scalars['String']['input'];
    page_type: QueryInput_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs =
  {
    day: Scalars['String']['input'];
    editor_type: QueryInput_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
    month: Scalars['String']['input'];
    page_type: QueryInput_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
    page_type: QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_EndArgs =
  {
    editor_type: QueryInput_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity;
    page_title: Scalars['String']['input'];
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_EndArgs =
  {
    access_site: QueryInput_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Access_Site;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Granularity;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_EndArgs =
  {
    access: QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Access;
    agent: QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Agent;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Granularity;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_EndArgs =
  {
    access: QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Access;
    agent: QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Agent;
    article: Scalars['String']['input'];
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Granularity;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_MonthArgs =
  {
    access: QueryInput_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Access;
    month: Scalars['String']['input'];
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_DayArgs =
  {
    access: QueryInput_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Access;
    day: Scalars['String']['input'];
    month: Scalars['String']['input'];
    project: Scalars['String']['input'];
    year: Scalars['String']['input'];
  };

export type QueryMetrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_EndArgs =
  {
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Granularity;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryMetrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_EndArgs =
  {
    access_site: QueryInput_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Access_Site;
    end: Scalars['String']['input'];
    granularity: QueryInput_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Granularity;
    project: Scalars['String']['input'];
    start: Scalars['String']['input'];
  };

export type QueryTransform_List_Pair_By_From_By_ToArgs = {
  from: Scalars['String']['input'];
  to: Scalars['String']['input'];
};

export type QueryTransform_List_Tool_By_ToolArgs = {
  tool: QueryInput_Transform_List_Tool_By_Tool_Tool;
};

export type QueryTransform_List_Tool_By_Tool_By_FromArgs = {
  from: Scalars['String']['input'];
  tool: QueryInput_Transform_List_Tool_By_Tool_By_From_Tool;
};

export type QueryTransform_List_Tool_By_Tool_By_From_By_ToArgs = {
  from: Scalars['String']['input'];
  to: Scalars['String']['input'];
  tool: QueryInput_Transform_List_Tool_By_Tool_By_From_By_To_Tool;
};

export type QueryTransform_Word_From_By_From_Lang_To_By_To_Lang_By_WordArgs = {
  from_lang: Scalars['String']['input'];
  to_lang: Scalars['String']['input'];
  word: Scalars['String']['input'];
};

export type QueryTransform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_By_ProviderArgs =
  {
    from_lang: Scalars['String']['input'];
    provider: QueryInput_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_By_Provider_Provider;
    to_lang: Scalars['String']['input'];
    word: Scalars['String']['input'];
  };

export type QueryViewsInPastMonthArgs = {
  project: Scalars['String']['input'];
};

export type Absolute_Bytes_Difference = {
  __typename?: 'absolute_bytes_difference';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Absolute_Bytes_Difference_Per_Page = {
  __typename?: 'absolute_bytes_difference_per_page';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Availability = {
  __typename?: 'availability';
  /** domains for wikis with this feature enabled, or [ '*.<project>.org' ] for all wikis in a project */
  in_the_news: Array<Maybe<Scalars['String']['output']>>;
  /** domains for wikis with this feature enabled, or [ '*.<project>.org' ] for all wikis in a project */
  most_read: Array<Maybe<Scalars['String']['output']>>;
  /** domains for wikis with this feature enabled, or [ '*.<project>.org' ] for all wikis in a project */
  on_this_day: Array<Maybe<Scalars['String']['output']>>;
  /** domains for wikis with this feature enabled, or [ '*.<project>.org' ] for all wikis in a project */
  picture_of_the_day: Array<Maybe<Scalars['String']['output']>>;
  /** domains for wikis with this feature enabled, or [ '*.<project>.org' ] for all wikis in a project */
  todays_featured_article: Array<Maybe<Scalars['String']['output']>>;
};

export type By_Country = {
  __typename?: 'by_country';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items>
    >
  >;
};

export type Cx_Dict = {
  __typename?: 'cx_dict';
  /** the original word to look up */
  source?: Maybe<Scalars['String']['output']>;
  /** the translations found */
  translations?: Maybe<
    Array<
      Maybe<Query_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_Translations_Items>
    >
  >;
};

export type Cx_Languagepairs = {
  __typename?: 'cx_languagepairs';
  /** the list of available source languages */
  source?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  /** the list of available destination languages */
  target?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export type Cx_List_Tools = {
  __typename?: 'cx_list_tools';
  /** the list of tools available for the given language pair */
  tools?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export type Cx_Mt = {
  __typename?: 'cx_mt';
  /** the translated content */
  contents?: Maybe<Scalars['String']['output']>;
};

export type Edited_Pages = {
  __typename?: 'edited_pages';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Editors = {
  __typename?: 'editors';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Edits = {
  __typename?: 'edits';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Edits_Per_Page = {
  __typename?: 'edits_per_page';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export enum Join__Graph {
  Wiki = 'WIKI',
}

export enum Link__Purpose {
  /** `EXECUTION` features provide metadata necessary for operation execution. */
  Execution = 'EXECUTION',
  /** `SECURITY` features provide metadata necessary to securely resolve fields. */
  Security = 'SECURITY',
}

/** The input type of the given formula; can be tex or inline-tex */
export enum MutationInput_Post_Media_Math_Check_By_Type_Type {
  Chem = 'chem',
  InlineTex = 'inline_tex',
  Tex = 'tex',
}

/** The machine translation provider id */
export enum MutationInput_Post_Transform_Html_From_By_From_Lang_To_By_To_Lang_By_Provider_Provider {
  Apertium = 'Apertium',
  Yandex = 'Yandex',
  Youdao = 'Youdao',
}

export type Net_Bytes_Difference = {
  __typename?: 'net_bytes_difference';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Net_Bytes_Difference_Per_Page = {
  __typename?: 'net_bytes_difference_per_page';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type New_Pages = {
  __typename?: 'new_pages';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type New_Registered_Users = {
  __typename?: 'new_registered_users';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Pagecounts_Project = {
  __typename?: 'pagecounts_project';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Pageview_Article = {
  __typename?: 'pageview_article';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Pageview_Project = {
  __typename?: 'pageview_project';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type Pageview_Tops = {
  __typename?: 'pageview_tops';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

/** The output format; can be svg or mml */
export enum QueryInput_Media_Math_Render_By_Format_By_Hash_Format {
  Mml = 'mml',
  Png = 'png',
  Svg = 'svg',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/** Time unit for the response data. As of today, supported values are daily and monthly */
export enum QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/** Time unit for the response data. As of today, supported values are daily and monthly */
export enum QueryInput_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/** Time unit for the response data. As of today, supported values are daily and monthly */
export enum QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/** Time unit for the response data. As of today, supported values are daily and monthly */
export enum QueryInput_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by activity-level, use one of 1..4-edits, 5..24-edits,
 * 25..99-edits or 100..-edits. If you are interested in edited-pages regardless
 * of their activity level, use all-activity-levels.
 */
export enum QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Activity_Level {
  '1_4Edits' = '_1__4_edits',
  '5_24Edits' = '_5__24_edits',
  '25_99Edits' = '_25__99_edits',
  '100Edits' = '_100___edits',
  AllActivityLevels = 'all_activity_levels',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * The time unit for the response data. As of today, supported values are
 * daily and monthly.
 */
export enum QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by page-type, use one of content (edited-pages in content
 * namespaces) or non-content (edited-pages in non-content namespaces). If you are
 * interested in edited-pages regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging
 * to the bot group but having bot-like names) or user (registered account not in bot
 * group nor having bot-like name). If you are interested in edits regardless of
 * their editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * The time unit for the response data. As of today, supported values are
 * daily and monthly.
 */
export enum QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by page-type, use one of content (new pages in content
 * namespaces) or non-content (new pages in non-content namespaces). If you are
 * interested in new-articles regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by activity-level, use one of 1..4-edits, 5..24-edits,
 * 25..99-edits or 100..-edits. If you are interested in editors regardless
 * of their activity-level, use all-activity-levels.
 */
export enum QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Activity_Level {
  '1_4Edits' = '_1__4_edits',
  '5_24Edits' = '_5__24_edits',
  '25_99Edits' = '_25__99_edits',
  '100Edits' = '_100___edits',
  AllActivityLevels = 'all_activity_levels',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging
 * to the bot group but having bot-like names) or user (registered account not in bot
 * group nor having bot-like name). If you are interested in edits regardless
 * of their editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * The time unit for the response data. As of today, supported values are
 * daily and monthly.
 */
export enum QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by page-type, use one of content (edits made in content
 * namespaces) or non-content (edits made in non-content namespaces). If you are
 * interested in editors regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging
 * to the bot group but having bot-like names) or user (registered account not in bot
 * group nor having bot-like name). If you are interested in edits regardless
 * of their editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/**
 * The time unit for the response data. As of today, supported values are
 * daily and monthly.
 */
export enum QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by page-type, use one of content (edits on pages in content
 * namespaces) or non-content (edits on pages in non-content namespaces). If you are
 * interested in edits regardless of their page-type, use all-page-types.
 */
export enum QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type {
  AllPageTypes = 'all_page_types',
  Content = 'content',
  NonContent = 'non_content',
}

/**
 * If you want to filter by editor-type, use one of anonymous, group-bot (registered
 * accounts belonging to the bot group), name-bot (registered accounts not belonging to
 * the bot group but having bot-like names) or user (registered account not in bot group
 * nor having bot-like name). If you are interested in edits regardless of their
 * editor-type, use all-editor-types.
 */
export enum QueryInput_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type {
  AllEditorTypes = 'all_editor_types',
  Anonymous = 'anonymous',
  GroupBot = 'group_bot',
  NameBot = 'name_bot',
  User = 'user',
}

/** Time unit for the response data. As of today, supported values are daily and monthly */
export enum QueryInput_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/** If you want to filter by access site, use one of desktop-site or mobile-site. If you are interested in pagecounts regardless of access site use all-sites. */
export enum QueryInput_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Access_Site {
  AllSites = 'all_sites',
  DesktopSite = 'desktop_site',
  MobileSite = 'mobile_site',
}

/**
 * The time unit for the response data. As of today, the supported granularities for
 * this endpoint are hourly, daily and monthly.
 */
export enum QueryInput_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Hourly = 'hourly',
  Monthly = 'monthly',
}

/**
 * If you want to filter by access method, use one of desktop, mobile-app or mobile-web.
 * If you are interested in pageviews regardless of access method, use all-access.
 */
export enum QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Access {
  AllAccess = 'all_access',
  Desktop = 'desktop',
  MobileApp = 'mobile_app',
  MobileWeb = 'mobile_web',
}

/**
 * If you want to filter by agent type, use one of user or spider. If you are interested
 * in pageviews regardless of agent type, use all-agents.
 */
export enum QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Agent {
  AllAgents = 'all_agents',
  Spider = 'spider',
  User = 'user',
}

/**
 * The time unit for the response data. As of today, the supported granularities for this
 * endpoint are hourly, daily, and monthly.
 */
export enum QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Hourly = 'hourly',
  Monthly = 'monthly',
}

/**
 * If you want to filter by access method, use one of desktop, mobile-app
 * or mobile-web. If you are interested in pageviews regardless of access method,
 * use all-access.
 */
export enum QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Access {
  AllAccess = 'all_access',
  Desktop = 'desktop',
  MobileApp = 'mobile_app',
  MobileWeb = 'mobile_web',
}

/**
 * If you want to filter by agent type, use one of user, bot or spider. If you are
 * interested in pageviews regardless of agent type, use all-agents.
 */
export enum QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Agent {
  AllAgents = 'all_agents',
  Bot = 'bot',
  Spider = 'spider',
  User = 'user',
}

/**
 * The time unit for the response data. As of today, the only supported granularity for
 * this endpoint is daily and monthly.
 */
export enum QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by access method, use one of desktop, mobile-app or mobile-web.
 * If you are interested in pageviews regardless of access method, use all-access.
 */
export enum QueryInput_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Access {
  AllAccess = 'all_access',
  Desktop = 'desktop',
  MobileApp = 'mobile_app',
  MobileWeb = 'mobile_web',
}

/**
 * If you want to filter by access method, use one of desktop, mobile-app or mobile-web.
 * If you are interested in pageviews regardless of access method, use all-access.
 */
export enum QueryInput_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Access {
  AllAccess = 'all_access',
  Desktop = 'desktop',
  MobileApp = 'mobile_app',
  MobileWeb = 'mobile_web',
}

/**
 * The time unit for the response data. As of today, supported values are
 * daily and monthly.
 */
export enum QueryInput_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/**
 * If you want to filter by accessed site, use one of desktop-site or mobile-site.
 * If you are interested in unique devices regardless of accessed site, use or all-sites.
 */
export enum QueryInput_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Access_Site {
  AllSites = 'all_sites',
  DesktopSite = 'desktop_site',
  MobileSite = 'mobile_site',
}

/**
 * The time unit for the response data. As of today, the supported granularities
 * for this endpoint are daily and monthly.
 */
export enum QueryInput_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Granularity {
  Daily = 'daily',
  Monthly = 'monthly',
}

/** The tool category to list tools and language pairs for */
export enum QueryInput_Transform_List_Tool_By_Tool_By_From_By_To_Tool {
  Dictionary = 'dictionary',
  Mt = 'mt',
}

/** The tool category to list tools and language pairs for */
export enum QueryInput_Transform_List_Tool_By_Tool_By_From_Tool {
  Dictionary = 'dictionary',
  Mt = 'mt',
}

/** The tool category to list tools and language pairs for */
export enum QueryInput_Transform_List_Tool_By_Tool_Tool {
  Dictionary = 'dictionary',
  Mt = 'mt',
}

/** The dictionary provider id */
export enum QueryInput_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_By_Provider_Provider {
  Dictd = 'Dictd',
  JsonDict = 'JsonDict',
}

export type Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items';
    abs_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_title?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items';
    abs_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items';
    net_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_title?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items';
    net_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items';
    activity_level?: Maybe<Scalars['String']['output']>;
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items';
    edited_pages?: Maybe<Scalars['Int']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items';
    new_pages?: Maybe<Scalars['Int']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items';
    timestamp?: Maybe<Scalars['String']['output']>;
    top?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items';
    abs_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    page_title?: Maybe<Scalars['String']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
  };

export type Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items';
    timestamp?: Maybe<Scalars['String']['output']>;
    top?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items';
    edits?: Maybe<Scalars['BigInt']['output']>;
    page_title?: Maybe<Scalars['String']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
  };

export type Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items';
    timestamp?: Maybe<Scalars['String']['output']>;
    top?: Maybe<
      Array<
        Maybe<Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>
      >
    >;
  };

export type Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items =
  {
    __typename?: 'query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items';
    net_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    page_title?: Maybe<Scalars['String']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
  };

export type Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items';
    activity_level?: Maybe<Scalars['String']['output']>;
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items';
    editors?: Maybe<Scalars['Int']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items';
    timestamp?: Maybe<Scalars['String']['output']>;
    top?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items =
  {
    __typename?: 'query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items';
    abs_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
    user_text?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items';
    timestamp?: Maybe<Scalars['String']['output']>;
    top?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items =
  {
    __typename?: 'query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items';
    edits?: Maybe<Scalars['BigInt']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
    user_text?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items';
    timestamp?: Maybe<Scalars['String']['output']>;
    top?: Maybe<
      Array<
        Maybe<Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>
      >
    >;
  };

export type Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items =
  {
    __typename?: 'query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items';
    net_bytes_diff?: Maybe<Scalars['BigInt']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
    user_text?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_type?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items';
    edits?: Maybe<Scalars['BigInt']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items';
    editor_type?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    page_title?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items';
    edits?: Maybe<Scalars['BigInt']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items';
    access_site?: Maybe<Scalars['String']['output']>;
    count?: Maybe<Scalars['BigInt']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items';
    access?: Maybe<Scalars['String']['output']>;
    agent?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
    views?: Maybe<Scalars['BigInt']['output']>;
  };

export type Query_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items';
    access?: Maybe<Scalars['String']['output']>;
    agent?: Maybe<Scalars['String']['output']>;
    article?: Maybe<Scalars['String']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
    views?: Maybe<Scalars['BigInt']['output']>;
  };

export type Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items =
  {
    __typename?: 'query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items';
    access?: Maybe<Scalars['String']['output']>;
    countries?: Maybe<
      Array<
        Maybe<Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items_Countries_Items>
      >
    >;
    month?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    year?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items_Countries_Items =
  {
    __typename?: 'query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items';
    country?: Maybe<Scalars['String']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
    views?: Maybe<Scalars['BigInt']['output']>;
  };

export type Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items =
  {
    __typename?: 'query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items';
    access?: Maybe<Scalars['String']['output']>;
    articles?: Maybe<
      Array<
        Maybe<Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items_Articles_Items>
      >
    >;
    day?: Maybe<Scalars['String']['output']>;
    month?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    year?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items_Articles_Items =
  {
    __typename?: 'query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items';
    article?: Maybe<Scalars['String']['output']>;
    rank?: Maybe<Scalars['Int']['output']>;
    views?: Maybe<Scalars['BigInt']['output']>;
  };

export type Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items';
    granularity?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    results?: Maybe<
      Array<
        Maybe<Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items_Results_Items>
      >
    >;
  };

export type Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items_Results_Items =
  {
    __typename?: 'query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items';
    new_registered_users?: Maybe<Scalars['Int']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items =
  {
    __typename?: 'query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items';
    access_site?: Maybe<Scalars['String']['output']>;
    devices?: Maybe<Scalars['BigInt']['output']>;
    granularity?: Maybe<Scalars['String']['output']>;
    project?: Maybe<Scalars['String']['output']>;
    timestamp?: Maybe<Scalars['String']['output']>;
  };

export type Query_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_Translations_Items =
  {
    __typename?: 'query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items';
    /** extra information about the phrase */
    info?: Maybe<Scalars['String']['output']>;
    /** the translated phrase */
    phrase?: Maybe<Scalars['String']['output']>;
    /** the source dictionary used for the translation */
    sources?: Maybe<Scalars['String']['output']>;
  };

export type Top_Edited_Pages_By_Abs_Bytes_Diff = {
  __typename?: 'top_edited_pages_by_abs_bytes_diff';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

export type Top_Edited_Pages_By_Edits = {
  __typename?: 'top_edited_pages_by_edits';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

export type Top_Edited_Pages_By_Net_Bytes_Diff = {
  __typename?: 'top_edited_pages_by_net_bytes_diff';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

export type Top_Editors_By_Abs_Bytes_Diff = {
  __typename?: 'top_editors_by_abs_bytes_diff';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

export type Top_Editors_By_Edits = {
  __typename?: 'top_editors_by_edits';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

export type Top_Editors_By_Net_Bytes_Diff = {
  __typename?: 'top_editors_by_net_bytes_diff';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>
    >
  >;
};

export type Unique_Devices = {
  __typename?: 'unique_devices';
  items?: Maybe<
    Array<
      Maybe<Query_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items>
    >
  >;
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type LegacyStitchingResolver<TResult, TParent, TContext, TArgs> = {
  fragment: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type NewStitchingResolver<TResult, TParent, TContext, TArgs> = {
  selectionSet: string | ((fieldNode: FieldNode) => SelectionSetNode);
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type StitchingResolver<TResult, TParent, TContext, TArgs> =
  | LegacyStitchingResolver<TResult, TParent, TContext, TArgs>
  | NewStitchingResolver<TResult, TParent, TContext, TArgs>;
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>
  | StitchingResolver<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >;
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  BigInt: ResolverTypeWrapper<Scalars['BigInt']['output']>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  HTTPMethod: HttpMethod;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  NonEmptyString: ResolverTypeWrapper<Scalars['NonEmptyString']['output']>;
  ObjMap: ResolverTypeWrapper<Scalars['ObjMap']['output']>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  _DirectiveExtensions: ResolverTypeWrapper<
    Scalars['_DirectiveExtensions']['output']
  >;
  absolute_bytes_difference: ResolverTypeWrapper<Absolute_Bytes_Difference>;
  absolute_bytes_difference_per_page: ResolverTypeWrapper<Absolute_Bytes_Difference_Per_Page>;
  availability: ResolverTypeWrapper<Availability>;
  by_country: ResolverTypeWrapper<By_Country>;
  cx_dict: ResolverTypeWrapper<Cx_Dict>;
  cx_languagepairs: ResolverTypeWrapper<Cx_Languagepairs>;
  cx_list_tools: ResolverTypeWrapper<Cx_List_Tools>;
  cx_mt: ResolverTypeWrapper<Cx_Mt>;
  edited_pages: ResolverTypeWrapper<Edited_Pages>;
  editors: ResolverTypeWrapper<Editors>;
  edits: ResolverTypeWrapper<Edits>;
  edits_per_page: ResolverTypeWrapper<Edits_Per_Page>;
  join__FieldSet: ResolverTypeWrapper<Scalars['join__FieldSet']['output']>;
  join__Graph: Join__Graph;
  link__Import: ResolverTypeWrapper<Scalars['link__Import']['output']>;
  link__Purpose: Link__Purpose;
  mutationInput_post_media_math_check_by_type_type: MutationInput_Post_Media_Math_Check_By_Type_Type;
  mutationInput_post_transform_html_from_by_from_lang_to_by_to_lang_by_provider_provider: MutationInput_Post_Transform_Html_From_By_From_Lang_To_By_To_Lang_By_Provider_Provider;
  net_bytes_difference: ResolverTypeWrapper<Net_Bytes_Difference>;
  net_bytes_difference_per_page: ResolverTypeWrapper<Net_Bytes_Difference_Per_Page>;
  new_pages: ResolverTypeWrapper<New_Pages>;
  new_registered_users: ResolverTypeWrapper<New_Registered_Users>;
  pagecounts_project: ResolverTypeWrapper<Pagecounts_Project>;
  pageview_article: ResolverTypeWrapper<Pageview_Article>;
  pageview_project: ResolverTypeWrapper<Pageview_Project>;
  pageview_tops: ResolverTypeWrapper<Pageview_Tops>;
  queryInput_media_math_render_by_format_by_hash_format: QueryInput_Media_Math_Render_By_Format_By_Hash_Format;
  queryInput_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_page_type: QueryInput_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
  queryInput_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_page_type: QueryInput_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
  queryInput_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_activity_level: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Activity_Level;
  queryInput_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_page_type: QueryInput_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Page_Type;
  queryInput_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_page_type: QueryInput_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
  queryInput_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_editor_type: QueryInput_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
  queryInput_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_page_type: QueryInput_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
  queryInput_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_editor_type: QueryInput_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
  queryInput_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_page_type: QueryInput_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
  queryInput_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_editor_type: QueryInput_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
  queryInput_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_page_type: QueryInput_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
  queryInput_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_activity_level: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Activity_Level;
  queryInput_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_page_type: QueryInput_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Page_Type;
  queryInput_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_editor_type: QueryInput_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
  queryInput_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_page_type: QueryInput_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
  queryInput_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_editor_type: QueryInput_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
  queryInput_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_page_type: QueryInput_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
  queryInput_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_editor_type: QueryInput_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Editor_Type;
  queryInput_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_page_type: QueryInput_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Page_Type;
  queryInput_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_page_type: QueryInput_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Page_Type;
  queryInput_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_editor_type: QueryInput_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Editor_Type;
  queryInput_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_access_site: QueryInput_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Access_Site;
  queryInput_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_access: QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Access;
  queryInput_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_agent: QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Agent;
  queryInput_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_access: QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Access;
  queryInput_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_agent: QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Agent;
  queryInput_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_access: QueryInput_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Access;
  queryInput_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_access: QueryInput_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Access;
  queryInput_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Granularity;
  queryInput_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_access_site: QueryInput_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Access_Site;
  queryInput_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_granularity: QueryInput_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Granularity;
  queryInput_transform_list_tool_by_tool_by_from_by_to_tool: QueryInput_Transform_List_Tool_By_Tool_By_From_By_To_Tool;
  queryInput_transform_list_tool_by_tool_by_from_tool: QueryInput_Transform_List_Tool_By_Tool_By_From_Tool;
  queryInput_transform_list_tool_by_tool_tool: QueryInput_Transform_List_Tool_By_Tool_Tool;
  queryInput_transform_word_from_by_from_lang_to_by_to_lang_by_word_by_provider_provider: QueryInput_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_By_Provider_Provider;
  query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: ResolverTypeWrapper<Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>;
  query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items>;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: ResolverTypeWrapper<Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items>;
  query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items: ResolverTypeWrapper<Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items>;
  query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items: ResolverTypeWrapper<Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items_Countries_Items>;
  query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items: ResolverTypeWrapper<Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items>;
  query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items: ResolverTypeWrapper<Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items_Articles_Items>;
  query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items>;
  query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items: ResolverTypeWrapper<Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items_Results_Items>;
  query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items: ResolverTypeWrapper<Query_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items>;
  query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items: ResolverTypeWrapper<Query_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_Translations_Items>;
  top_edited_pages_by_abs_bytes_diff: ResolverTypeWrapper<Top_Edited_Pages_By_Abs_Bytes_Diff>;
  top_edited_pages_by_edits: ResolverTypeWrapper<Top_Edited_Pages_By_Edits>;
  top_edited_pages_by_net_bytes_diff: ResolverTypeWrapper<Top_Edited_Pages_By_Net_Bytes_Diff>;
  top_editors_by_abs_bytes_diff: ResolverTypeWrapper<Top_Editors_By_Abs_Bytes_Diff>;
  top_editors_by_edits: ResolverTypeWrapper<Top_Editors_By_Edits>;
  top_editors_by_net_bytes_diff: ResolverTypeWrapper<Top_Editors_By_Net_Bytes_Diff>;
  unique_devices: ResolverTypeWrapper<Unique_Devices>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  BigInt: Scalars['BigInt']['output'];
  Boolean: Scalars['Boolean']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: Record<PropertyKey, never>;
  NonEmptyString: Scalars['NonEmptyString']['output'];
  ObjMap: Scalars['ObjMap']['output'];
  Query: Record<PropertyKey, never>;
  String: Scalars['String']['output'];
  _DirectiveExtensions: Scalars['_DirectiveExtensions']['output'];
  absolute_bytes_difference: Absolute_Bytes_Difference;
  absolute_bytes_difference_per_page: Absolute_Bytes_Difference_Per_Page;
  availability: Availability;
  by_country: By_Country;
  cx_dict: Cx_Dict;
  cx_languagepairs: Cx_Languagepairs;
  cx_list_tools: Cx_List_Tools;
  cx_mt: Cx_Mt;
  edited_pages: Edited_Pages;
  editors: Editors;
  edits: Edits;
  edits_per_page: Edits_Per_Page;
  join__FieldSet: Scalars['join__FieldSet']['output'];
  link__Import: Scalars['link__Import']['output'];
  net_bytes_difference: Net_Bytes_Difference;
  net_bytes_difference_per_page: Net_Bytes_Difference_Per_Page;
  new_pages: New_Pages;
  new_registered_users: New_Registered_Users;
  pagecounts_project: Pagecounts_Project;
  pageview_article: Pageview_Article;
  pageview_project: Pageview_Project;
  pageview_tops: Pageview_Tops;
  query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items: Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items;
  query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items: Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items: Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items: Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items: Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_Items;
  query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items: Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items: Query_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items: Query_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items: Query_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items: Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items;
  query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items: Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items_Countries_Items;
  query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items: Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items;
  query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items: Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items_Articles_Items;
  query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items: Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items;
  query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items: Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items_Results_Items;
  query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items: Query_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_Items;
  query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items: Query_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_Translations_Items;
  top_edited_pages_by_abs_bytes_diff: Top_Edited_Pages_By_Abs_Bytes_Diff;
  top_edited_pages_by_edits: Top_Edited_Pages_By_Edits;
  top_edited_pages_by_net_bytes_diff: Top_Edited_Pages_By_Net_Bytes_Diff;
  top_editors_by_abs_bytes_diff: Top_Editors_By_Abs_Bytes_Diff;
  top_editors_by_edits: Top_Editors_By_Edits;
  top_editors_by_net_bytes_diff: Top_Editors_By_Net_Bytes_Diff;
  unique_devices: Unique_Devices;
};

export type AdditionalFieldDirectiveArgs = {};

export type AdditionalFieldDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = AdditionalFieldDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type EnumDirectiveArgs = {
  subgraph?: Maybe<Scalars['String']['input']>;
  value?: Maybe<Scalars['String']['input']>;
};

export type EnumDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = EnumDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type ExtraSchemaDefinitionDirectiveDirectiveArgs = {
  directives?: Maybe<Scalars['_DirectiveExtensions']['input']>;
};

export type ExtraSchemaDefinitionDirectiveDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = ExtraSchemaDefinitionDirectiveDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type HttpOperationDirectiveArgs = {
  httpMethod?: Maybe<HttpMethod>;
  isBinary?: Maybe<Scalars['Boolean']['input']>;
  jsonApiFields?: Maybe<Scalars['Boolean']['input']>;
  operationSpecificHeaders?: Maybe<
    Array<Maybe<Array<Maybe<Scalars['String']['input']>>>>
  >;
  path?: Maybe<Scalars['String']['input']>;
  queryParamArgMap?: Maybe<Scalars['ObjMap']['input']>;
  queryStringOptions?: Maybe<Scalars['ObjMap']['input']>;
  queryStringOptionsByParam?: Maybe<Scalars['ObjMap']['input']>;
  requestBaseBody?: Maybe<Scalars['ObjMap']['input']>;
  subgraph?: Maybe<Scalars['String']['input']>;
};

export type HttpOperationDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = HttpOperationDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__EnumValueDirectiveArgs = {
  graph: Join__Graph;
};

export type Join__EnumValueDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__EnumValueDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__FieldDirectiveArgs = {
  external?: Maybe<Scalars['Boolean']['input']>;
  graph?: Maybe<Join__Graph>;
  override?: Maybe<Scalars['String']['input']>;
  provides?: Maybe<Scalars['join__FieldSet']['input']>;
  requires?: Maybe<Scalars['join__FieldSet']['input']>;
  type?: Maybe<Scalars['String']['input']>;
  usedOverridden?: Maybe<Scalars['Boolean']['input']>;
};

export type Join__FieldDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__FieldDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__GraphDirectiveArgs = {
  name: Scalars['String']['input'];
  url: Scalars['String']['input'];
};

export type Join__GraphDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__GraphDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__ImplementsDirectiveArgs = {
  graph: Join__Graph;
  interface: Scalars['String']['input'];
};

export type Join__ImplementsDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__ImplementsDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__TypeDirectiveArgs = {
  extension?: Scalars['Boolean']['input'];
  graph: Join__Graph;
  isInterfaceObject?: Scalars['Boolean']['input'];
  key?: Maybe<Scalars['join__FieldSet']['input']>;
  resolvable?: Scalars['Boolean']['input'];
};

export type Join__TypeDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__TypeDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type Join__UnionMemberDirectiveArgs = {
  graph: Join__Graph;
  member: Scalars['String']['input'];
};

export type Join__UnionMemberDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = Join__UnionMemberDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type LinkDirectiveArgs = {
  as?: Maybe<Scalars['String']['input']>;
  for?: Maybe<Link__Purpose>;
  import?: Maybe<Array<Maybe<Scalars['link__Import']['input']>>>;
  url?: Maybe<Scalars['String']['input']>;
};

export type LinkDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = LinkDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type ResolveRootFieldDirectiveArgs = {
  field?: Maybe<Scalars['String']['input']>;
  subgraph?: Maybe<Scalars['String']['input']>;
};

export type ResolveRootFieldDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = ResolveRootFieldDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type TransportDirectiveArgs = {
  headers?: Maybe<Array<Maybe<Array<Maybe<Scalars['String']['input']>>>>>;
  kind?: Maybe<Scalars['String']['input']>;
  location?: Maybe<Scalars['String']['input']>;
  queryParams?: Maybe<Array<Maybe<Array<Maybe<Scalars['String']['input']>>>>>;
  queryStringOptions?: Maybe<Scalars['ObjMap']['input']>;
  subgraph?: Maybe<Scalars['String']['input']>;
};

export type TransportDirectiveResolver<
  Result,
  Parent,
  ContextType = MeshInContextSDK,
  Args = TransportDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export interface BigIntScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['BigInt'],
  any
> {
  name: 'BigInt';
}

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['JSON'],
  any
> {
  name: 'JSON';
}

export type MutationResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['Mutation'] =
    ResolversParentTypes['Mutation'],
> = {
  post_media_math_check_by_type?: Resolver<
    Maybe<ResolversTypes['JSON']>,
    ParentType,
    ContextType,
    RequireFields<MutationPost_Media_Math_Check_By_TypeArgs, 'type'>
  >;
  post_transform_html_from_by_from_lang_to_by_to_lang?: Resolver<
    Maybe<ResolversTypes['cx_mt']>,
    ParentType,
    ContextType,
    RequireFields<
      MutationPost_Transform_Html_From_By_From_Lang_To_By_To_LangArgs,
      'from_lang' | 'to_lang'
    >
  >;
  post_transform_html_from_by_from_lang_to_by_to_lang_by_provider?: Resolver<
    Maybe<ResolversTypes['cx_mt']>,
    ParentType,
    ContextType,
    RequireFields<
      MutationPost_Transform_Html_From_By_From_Lang_To_By_To_Lang_By_ProviderArgs,
      'from_lang' | 'provider' | 'to_lang'
    >
  >;
};

export interface NonEmptyStringScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['NonEmptyString'],
  any
> {
  name: 'NonEmptyString';
}

export interface ObjMapScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['ObjMap'],
  any
> {
  name: 'ObjMap';
}

export type QueryResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['Query'] =
    ResolversParentTypes['Query'],
> = {
  feed_availability?: Resolver<
    Maybe<ResolversTypes['availability']>,
    ParentType,
    ContextType
  >;
  media_math_formula_by_hash?: Resolver<
    Maybe<ResolversTypes['JSON']>,
    ParentType,
    ContextType,
    RequireFields<QueryMedia_Math_Formula_By_HashArgs, 'hash'>
  >;
  media_math_render_by_format_by_hash?: Resolver<
    Maybe<ResolversTypes['JSON']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMedia_Math_Render_By_Format_By_HashArgs,
      'format' | 'hash'
    >
  >;
  metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['absolute_bytes_difference']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_type' | 'project' | 'start'
    >
  >;
  metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['absolute_bytes_difference_per_page']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_title' | 'project' | 'start'
    >
  >;
  metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['net_bytes_difference']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_type' | 'project' | 'start'
    >
  >;
  metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['net_bytes_difference_per_page']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_title' | 'project' | 'start'
    >
  >;
  metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['edited_pages']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_EndArgs,
      | 'activity_level'
      | 'editor_type'
      | 'end'
      | 'granularity'
      | 'page_type'
      | 'project'
      | 'start'
    >
  >;
  metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['new_pages']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_type' | 'project' | 'start'
    >
  >;
  metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['top_edited_pages_by_abs_bytes_diff']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs,
      'day' | 'editor_type' | 'month' | 'page_type' | 'project' | 'year'
    >
  >;
  metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['top_edited_pages_by_edits']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs,
      'day' | 'editor_type' | 'month' | 'page_type' | 'project' | 'year'
    >
  >;
  metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['top_edited_pages_by_net_bytes_diff']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs,
      'day' | 'editor_type' | 'month' | 'page_type' | 'project' | 'year'
    >
  >;
  metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['editors']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_EndArgs,
      | 'activity_level'
      | 'editor_type'
      | 'end'
      | 'granularity'
      | 'page_type'
      | 'project'
      | 'start'
    >
  >;
  metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['top_editors_by_abs_bytes_diff']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs,
      'day' | 'editor_type' | 'month' | 'page_type' | 'project' | 'year'
    >
  >;
  metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['top_editors_by_edits']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs,
      'day' | 'editor_type' | 'month' | 'page_type' | 'project' | 'year'
    >
  >;
  metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['top_editors_by_net_bytes_diff']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_DayArgs,
      'day' | 'editor_type' | 'month' | 'page_type' | 'project' | 'year'
    >
  >;
  metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['edits']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_type' | 'project' | 'start'
    >
  >;
  metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['edits_per_page']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_EndArgs,
      'editor_type' | 'end' | 'granularity' | 'page_title' | 'project' | 'start'
    >
  >;
  metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['pagecounts_project']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_EndArgs,
      'access_site' | 'end' | 'granularity' | 'project' | 'start'
    >
  >;
  metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['pageview_project']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_EndArgs,
      'access' | 'agent' | 'end' | 'granularity' | 'project' | 'start'
    >
  >;
  metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['pageview_article']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_EndArgs,
      | 'access'
      | 'agent'
      | 'article'
      | 'end'
      | 'granularity'
      | 'project'
      | 'start'
    >
  >;
  metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month?: Resolver<
    Maybe<ResolversTypes['by_country']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_MonthArgs,
      'access' | 'month' | 'project' | 'year'
    >
  >;
  metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day?: Resolver<
    Maybe<ResolversTypes['pageview_tops']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_DayArgs,
      'access' | 'day' | 'month' | 'project' | 'year'
    >
  >;
  metrics_registered_users_new_by_project_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['new_registered_users']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_EndArgs,
      'end' | 'granularity' | 'project' | 'start'
    >
  >;
  metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end?: Resolver<
    Maybe<ResolversTypes['unique_devices']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryMetrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_EndArgs,
      'access_site' | 'end' | 'granularity' | 'project' | 'start'
    >
  >;
  transform_list_languagepairs?: Resolver<
    Maybe<ResolversTypes['cx_languagepairs']>,
    ParentType,
    ContextType
  >;
  transform_list_pair_by_from_by_to?: Resolver<
    Maybe<ResolversTypes['cx_list_tools']>,
    ParentType,
    ContextType,
    RequireFields<QueryTransform_List_Pair_By_From_By_ToArgs, 'from' | 'to'>
  >;
  transform_list_tool_by_tool?: Resolver<
    Maybe<ResolversTypes['JSON']>,
    ParentType,
    ContextType,
    RequireFields<QueryTransform_List_Tool_By_ToolArgs, 'tool'>
  >;
  transform_list_tool_by_tool_by_from?: Resolver<
    Maybe<ResolversTypes['JSON']>,
    ParentType,
    ContextType,
    RequireFields<QueryTransform_List_Tool_By_Tool_By_FromArgs, 'from' | 'tool'>
  >;
  transform_list_tool_by_tool_by_from_by_to?: Resolver<
    Maybe<ResolversTypes['JSON']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryTransform_List_Tool_By_Tool_By_From_By_ToArgs,
      'from' | 'to' | 'tool'
    >
  >;
  transform_word_from_by_from_lang_to_by_to_lang_by_word?: Resolver<
    Maybe<ResolversTypes['cx_dict']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryTransform_Word_From_By_From_Lang_To_By_To_Lang_By_WordArgs,
      'from_lang' | 'to_lang' | 'word'
    >
  >;
  transform_word_from_by_from_lang_to_by_to_lang_by_word_by_provider?: Resolver<
    Maybe<ResolversTypes['cx_dict']>,
    ParentType,
    ContextType,
    RequireFields<
      QueryTransform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_By_ProviderArgs,
      'from_lang' | 'provider' | 'to_lang' | 'word'
    >
  >;
  viewsInPastMonth?: Resolver<
    ResolversTypes['String'],
    ParentType,
    ContextType,
    RequireFields<QueryViewsInPastMonthArgs, 'project'>
  >;
};

export interface _DirectiveExtensionsScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['_DirectiveExtensions'],
  any
> {
  name: '_DirectiveExtensions';
}

export type Absolute_Bytes_DifferenceResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['absolute_bytes_difference'] =
    ResolversParentTypes['absolute_bytes_difference'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Absolute_Bytes_Difference_Per_PageResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['absolute_bytes_difference_per_page'] =
    ResolversParentTypes['absolute_bytes_difference_per_page'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type AvailabilityResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['availability'] =
    ResolversParentTypes['availability'],
> = {
  in_the_news?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  most_read?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  on_this_day?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  picture_of_the_day?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  todays_featured_article?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
};

export type By_CountryResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['by_country'] =
    ResolversParentTypes['by_country'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Cx_DictResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['cx_dict'] =
    ResolversParentTypes['cx_dict'],
> = {
  source?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  translations?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Cx_LanguagepairsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['cx_languagepairs'] =
    ResolversParentTypes['cx_languagepairs'],
> = {
  source?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['String']>>>,
    ParentType,
    ContextType
  >;
  target?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['String']>>>,
    ParentType,
    ContextType
  >;
};

export type Cx_List_ToolsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['cx_list_tools'] =
    ResolversParentTypes['cx_list_tools'],
> = {
  tools?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['String']>>>,
    ParentType,
    ContextType
  >;
};

export type Cx_MtResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['cx_mt'] =
    ResolversParentTypes['cx_mt'],
> = {
  contents?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type Edited_PagesResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['edited_pages'] =
    ResolversParentTypes['edited_pages'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type EditorsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['editors'] =
    ResolversParentTypes['editors'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type EditsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['edits'] =
    ResolversParentTypes['edits'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Edits_Per_PageResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['edits_per_page'] =
    ResolversParentTypes['edits_per_page'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export interface Join__FieldSetScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['join__FieldSet'],
  any
> {
  name: 'join__FieldSet';
}

export interface Link__ImportScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['link__Import'],
  any
> {
  name: 'link__Import';
}

export type Net_Bytes_DifferenceResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['net_bytes_difference'] =
    ResolversParentTypes['net_bytes_difference'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Net_Bytes_Difference_Per_PageResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['net_bytes_difference_per_page'] =
    ResolversParentTypes['net_bytes_difference_per_page'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type New_PagesResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['new_pages'] =
    ResolversParentTypes['new_pages'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type New_Registered_UsersResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['new_registered_users'] =
    ResolversParentTypes['new_registered_users'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Pagecounts_ProjectResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['pagecounts_project'] =
    ResolversParentTypes['pagecounts_project'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Pageview_ArticleResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['pageview_article'] =
    ResolversParentTypes['pageview_article'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Pageview_ProjectResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['pageview_project'] =
    ResolversParentTypes['pageview_project'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Pageview_TopsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['pageview_tops'] =
    ResolversParentTypes['pageview_tops'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  abs_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_title?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  abs_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  net_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_title?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  net_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items'],
> = {
  activity_level?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  edited_pages?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  new_pages?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'],
> = {
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  top?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'],
> = {
  abs_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  page_title?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'],
> = {
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  top?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'],
> = {
  edits?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  page_title?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'],
> = {
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  top?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'] =
    ResolversParentTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'],
> = {
  net_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  page_title?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items'],
> = {
  activity_level?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  editors?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'],
> = {
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  top?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'],
> = {
  abs_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  user_text?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'],
> = {
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  top?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'],
> = {
  edits?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  user_text?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items'],
> = {
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  top?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'] =
    ResolversParentTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items'],
> = {
  net_bytes_diff?: Resolver<
    Maybe<ResolversTypes['BigInt']>,
    ParentType,
    ContextType
  >;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  user_text?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  edits?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items'],
> = {
  editor_type?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  page_title?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  edits?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items'],
> = {
  access_site?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  count?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items'],
> = {
  access?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  agent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  views?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
};

export type Query_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items'],
> = {
  access?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  agent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  article?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  views?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
};

export type Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items'] =
    ResolversParentTypes['query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items'],
> = {
  access?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  countries?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
  month?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  year?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items_Countries_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items'] =
    ResolversParentTypes['query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items'],
> = {
  country?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  views?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
};

export type Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items'] =
    ResolversParentTypes['query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items'],
> = {
  access?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  articles?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
  day?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  month?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  year?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items_Articles_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items'] =
    ResolversParentTypes['query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items'],
> = {
  article?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  views?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
};

export type Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items'],
> = {
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  results?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items'] =
    ResolversParentTypes['query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items'],
> = {
  new_registered_users?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items'] =
    ResolversParentTypes['query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items'],
> = {
  access_site?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  devices?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  granularity?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  project?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timestamp?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type Query_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_Translations_ItemsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items'] =
    ResolversParentTypes['query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items'],
> = {
  info?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  phrase?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sources?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type Top_Edited_Pages_By_Abs_Bytes_DiffResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['top_edited_pages_by_abs_bytes_diff'] =
    ResolversParentTypes['top_edited_pages_by_abs_bytes_diff'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Top_Edited_Pages_By_EditsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['top_edited_pages_by_edits'] =
    ResolversParentTypes['top_edited_pages_by_edits'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Top_Edited_Pages_By_Net_Bytes_DiffResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends
    ResolversParentTypes['top_edited_pages_by_net_bytes_diff'] =
    ResolversParentTypes['top_edited_pages_by_net_bytes_diff'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Top_Editors_By_Abs_Bytes_DiffResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['top_editors_by_abs_bytes_diff'] =
    ResolversParentTypes['top_editors_by_abs_bytes_diff'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Top_Editors_By_EditsResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['top_editors_by_edits'] =
    ResolversParentTypes['top_editors_by_edits'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Top_Editors_By_Net_Bytes_DiffResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['top_editors_by_net_bytes_diff'] =
    ResolversParentTypes['top_editors_by_net_bytes_diff'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Unique_DevicesResolvers<
  ContextType = MeshInContextSDK,
  ParentType extends ResolversParentTypes['unique_devices'] =
    ResolversParentTypes['unique_devices'],
> = {
  items?: Resolver<
    Maybe<
      Array<
        Maybe<
          ResolversTypes['query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items']
        >
      >
    >,
    ParentType,
    ContextType
  >;
};

export type Resolvers<ContextType = MeshInContextSDK> = {
  BigInt?: GraphQLScalarType;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  NonEmptyString?: GraphQLScalarType;
  ObjMap?: GraphQLScalarType;
  Query?: QueryResolvers<ContextType>;
  _DirectiveExtensions?: GraphQLScalarType;
  absolute_bytes_difference?: Absolute_Bytes_DifferenceResolvers<ContextType>;
  absolute_bytes_difference_per_page?: Absolute_Bytes_Difference_Per_PageResolvers<ContextType>;
  availability?: AvailabilityResolvers<ContextType>;
  by_country?: By_CountryResolvers<ContextType>;
  cx_dict?: Cx_DictResolvers<ContextType>;
  cx_languagepairs?: Cx_LanguagepairsResolvers<ContextType>;
  cx_list_tools?: Cx_List_ToolsResolvers<ContextType>;
  cx_mt?: Cx_MtResolvers<ContextType>;
  edited_pages?: Edited_PagesResolvers<ContextType>;
  editors?: EditorsResolvers<ContextType>;
  edits?: EditsResolvers<ContextType>;
  edits_per_page?: Edits_Per_PageResolvers<ContextType>;
  join__FieldSet?: GraphQLScalarType;
  link__Import?: GraphQLScalarType;
  net_bytes_difference?: Net_Bytes_DifferenceResolvers<ContextType>;
  net_bytes_difference_per_page?: Net_Bytes_Difference_Per_PageResolvers<ContextType>;
  new_pages?: New_PagesResolvers<ContextType>;
  new_registered_users?: New_Registered_UsersResolvers<ContextType>;
  pagecounts_project?: Pagecounts_ProjectResolvers<ContextType>;
  pageview_article?: Pageview_ArticleResolvers<ContextType>;
  pageview_project?: Pageview_ProjectResolvers<ContextType>;
  pageview_tops?: Pageview_TopsResolvers<ContextType>;
  query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_absolute_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Bytes_Difference_Absolute_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_absolute_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Bytes_Difference_Absolute_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_net_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Bytes_Difference_Net_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_bytes_difference_net_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Bytes_Difference_Net_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items?: Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Edited_Pages_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_new_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Edited_Pages_New_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items?: Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items?: Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items?: Query_Metrics_Edited_Pages_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items?: Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items?: Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items?: Query_Metrics_Edited_Pages_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items?: Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items?: Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edited_pages_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items?: Query_Metrics_Edited_Pages_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<ContextType>;
  query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items?: Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_editors_aggregate_by_project_by_editor_type_by_page_type_by_activity_level_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Editors_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Activity_Level_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items?: Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items?: Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_absolute_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items?: Query_Metrics_Editors_Top_By_Absolute_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items?: Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items?: Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_edits_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items?: Query_Metrics_Editors_Top_By_Edits_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items?: Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items?: Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_editors_top_by_net_bytes_difference_by_project_by_editor_type_by_page_type_by_year_by_month_by_day_items_items_results_items_top_items?: Query_Metrics_Editors_Top_By_Net_Bytes_Difference_By_Project_By_Editor_Type_By_Page_Type_By_Year_By_Month_By_Day_Items_Items_Results_Items_Top_ItemsResolvers<ContextType>;
  query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_edits_aggregate_by_project_by_editor_type_by_page_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Edits_Aggregate_By_Project_By_Editor_Type_By_Page_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items?: Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_edits_per_page_by_project_by_page_title_by_editor_type_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Edits_Per_Page_By_Project_By_Page_Title_By_Editor_Type_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_legacy_pagecounts_aggregate_by_project_by_access_site_by_granularity_by_start_by_end_items_items?: Query_Metrics_Legacy_Pagecounts_Aggregate_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_pageviews_aggregate_by_project_by_access_by_agent_by_granularity_by_start_by_end_items_items?: Query_Metrics_Pageviews_Aggregate_By_Project_By_Access_By_Agent_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_pageviews_per_article_by_project_by_access_by_agent_by_article_by_granularity_by_start_by_end_items_items?: Query_Metrics_Pageviews_Per_Article_By_Project_By_Access_By_Agent_By_Article_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items?: Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_ItemsResolvers<ContextType>;
  query_metrics_pageviews_top_by_country_by_project_by_access_by_year_by_month_items_items_countries_items?: Query_Metrics_Pageviews_Top_By_Country_By_Project_By_Access_By_Year_By_Month_Items_Items_Countries_ItemsResolvers<ContextType>;
  query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items?: Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_ItemsResolvers<ContextType>;
  query_metrics_pageviews_top_by_project_by_access_by_year_by_month_by_day_items_items_articles_items?: Query_Metrics_Pageviews_Top_By_Project_By_Access_By_Year_By_Month_By_Day_Items_Items_Articles_ItemsResolvers<ContextType>;
  query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items?: Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_metrics_registered_users_new_by_project_by_granularity_by_start_by_end_items_items_results_items?: Query_Metrics_Registered_Users_New_By_Project_By_Granularity_By_Start_By_End_Items_Items_Results_ItemsResolvers<ContextType>;
  query_metrics_unique_devices_by_project_by_access_site_by_granularity_by_start_by_end_items_items?: Query_Metrics_Unique_Devices_By_Project_By_Access_Site_By_Granularity_By_Start_By_End_Items_ItemsResolvers<ContextType>;
  query_transform_word_from_by_from_lang_to_by_to_lang_by_word_translations_items?: Query_Transform_Word_From_By_From_Lang_To_By_To_Lang_By_Word_Translations_ItemsResolvers<ContextType>;
  top_edited_pages_by_abs_bytes_diff?: Top_Edited_Pages_By_Abs_Bytes_DiffResolvers<ContextType>;
  top_edited_pages_by_edits?: Top_Edited_Pages_By_EditsResolvers<ContextType>;
  top_edited_pages_by_net_bytes_diff?: Top_Edited_Pages_By_Net_Bytes_DiffResolvers<ContextType>;
  top_editors_by_abs_bytes_diff?: Top_Editors_By_Abs_Bytes_DiffResolvers<ContextType>;
  top_editors_by_edits?: Top_Editors_By_EditsResolvers<ContextType>;
  top_editors_by_net_bytes_diff?: Top_Editors_By_Net_Bytes_DiffResolvers<ContextType>;
  unique_devices?: Unique_DevicesResolvers<ContextType>;
};

export type DirectiveResolvers<ContextType = MeshInContextSDK> = {
  additionalField?: AdditionalFieldDirectiveResolver<any, any, ContextType>;
  enum?: EnumDirectiveResolver<any, any, ContextType>;
  extraSchemaDefinitionDirective?: ExtraSchemaDefinitionDirectiveDirectiveResolver<
    any,
    any,
    ContextType
  >;
  httpOperation?: HttpOperationDirectiveResolver<any, any, ContextType>;
  join__enumValue?: Join__EnumValueDirectiveResolver<any, any, ContextType>;
  join__field?: Join__FieldDirectiveResolver<any, any, ContextType>;
  join__graph?: Join__GraphDirectiveResolver<any, any, ContextType>;
  join__implements?: Join__ImplementsDirectiveResolver<any, any, ContextType>;
  join__type?: Join__TypeDirectiveResolver<any, any, ContextType>;
  join__unionMember?: Join__UnionMemberDirectiveResolver<any, any, ContextType>;
  link?: LinkDirectiveResolver<any, any, ContextType>;
  resolveRootField?: ResolveRootFieldDirectiveResolver<any, any, ContextType>;
  transport?: TransportDirectiveResolver<any, any, ContextType>;
};
