CREATE TABLE public.gallery_images (
    id integer NOT NULL,
    title character varying(100) NOT NULL,
    description text,
    image_data bytea NOT NULL,
    mime_type character varying(50) DEFAULT 'image/jpeg'::character varying NOT NULL,
    thumbnail_image bytea
);

ALTER TABLE public.gallery_images OWNER TO postgres;

--
-- Name: gallery_images_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.gallery_images_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gallery_images_id_seq OWNER TO postgres;

--
-- Name: gallery_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.gallery_images_id_seq OWNED BY public.gallery_images.id;


--
-- Name: gallery_images id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_images ALTER COLUMN id SET DEFAULT nextval('public.gallery_images_id_seq'::regclass);


--
-- Name: gallery_images gallery_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_pkey PRIMARY KEY (id);


--
-- Name: TABLE gallery_images; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.gallery_images TO myuser;


--
-- Name: SEQUENCE gallery_images_id_seq; Type: ACL; Schema: public; Owner: postgres
--

-- GRANT ALL ON SEQUENCE public.gallery_images_id_seq TO myuser;
